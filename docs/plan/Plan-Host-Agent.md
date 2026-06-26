# Host-Agent für System-Updates (Phase 3)

**Status:** Plan – Umsetzung als Migration von §26 Phase 2 (Updater-Sidecar).  
**Ziel:** Verlässliche, testbare Update-Orchestrierung auf dem Host durch einen dedizierten **Go-Agent** (systemd), mit expliziter State Machine, Preflight und Idempotenz.  
**Referenz:** [Betrieb: Releases, Backup, Update](Plan-Betrieb-Releases-Backup-Update.md) §5, [Infrastruktur & Deployment](Infrastruktur-und-Deployment.md) §3, [Umsetzungs-Todo §26](Umsetzungs-Todo.md), [Env-und-Config](Env-und-Config.md).

---

## 1. Ausgangslage und Problem

§26 Phase 2 (Updater-Sidecar) erfüllt das Sicherheitsziel **kein Docker-Socket in der App**, ist in der Ausführung aber fragil:

```text
docsops-app → docsops-updater (Container) → bash/updater-exec-update.sh
  → One-Off-Container docsops-update-run → update.sh → common.sh → docker compose
```

**Bekannte Schwächen:**

| Problem                                | Ursache                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `sed: Resource busy` auf `docsops.env` | `sed -i` (rename) auf bind-gemounteter Datei, die laufende Container offen halten |
| `no such object: docsops-update-run`   | Race zwischen schnellem Container-Exit und `docker inspect`/`docker rm`           |
| Schwer testbare Fehler                 | Shell-Kette, impliziter Ablauf, wenig strukturierte Fehlercodes                   |
| Doppelter Docker-Socket                | Sidecar + One-Off-Container                                                       |

Manuelles `sudo /opt/docsops/scripts/update.sh` auf dem **Host** funktioniert zuverlässiger, weil Dateisystem und Env direkt auf dem Host bearbeitet werden.

**Vorbild:** [Coolify](https://coolify.io) trennt Control Plane (UI/API) und Host-Ausführung (Docker-Socket, Dateien auf dem Server). DocsOps braucht keine Multi-Server-PaaS-Komplexität ([Plan-Managed-Hosting](Plan-Managed-Hosting.md) §2), aber dieselbe **Idee**: ein dedizierter Host-Prozess führt Deploy-Befehle aus.

---

## 2. Zielarchitektur

### 2.1 Rollen

| Komponente        | Ort                               | Rolle                                                                |
| ----------------- | --------------------------------- | -------------------------------------------------------------------- |
| **Control Plane** | Container (`docsops-app`, Worker) | Admin-UI, `UpdateRun` in DB, Backup-Gate, Wartungsmodus, Jobs        |
| **Host-Agent**    | Host (systemd)                    | Update-Orchestrierung: Bundle, Env, `docker compose pull/up`, Health |
| **Docker Engine** | Host                              | Container-Laufzeit (unverändert)                                     |

```text
┌─────────────────────────────────────────────────────────────┐
│  Docker Compose Stack                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ app      │  │ worker   │  │ postgres │  …                │
│  └────┬─────┘  └────┬─────┘  └──────────┘                   │
│       │             │                                       │
│       └──────┬──────┘                                       │
│              │ HTTP (Bearer)                                │
└──────────────┼──────────────────────────────────────────────┘
               │ 127.0.0.1:PORT  oder  Unix-Socket
               ▼
┌──────────────────────────────────────────────────────────────┐
│  Host                                                          │
│  docsops-agent (systemd, Go-Binary)                           │
│    → /etc/docsops/docsops.env                                  │
│    → /opt/docsops                                              │
│    → /var/lib/docsops/ (State, Bundle-Cache)                   │
│    → docker compose (Subprozess)                               │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Was unverändert bleibt

- Release-Bundle (`docsops-vX.Y.Z.tar.gz`) + GHCR-Images
- `docker-compose.yml` + `docker-compose.prod.yml`
- `/etc/docsops/docsops.env` als Konfig-SSOT (`DOCSOPS_VERSION`, Secrets)
- `/opt/docsops` als Deploy-Verzeichnis (Compose, Caddy, Skripte)
- `UpdateRun` + `maintenance.backup` (`pre_update`) + Wartungsmodus + Notifications
- `install.sh` / `install-prod.sh` als Bootstrap (erweitert um Agent-Installation)
- `scripts/update.sh` als **Runbook-Fallback** und für manuelle Updates (delegiert später optional an Agent-CLI)

### 2.3 Was entfällt (nach Migration)

- Image `docsops-updater` im Compose-Stack
- `scripts/updater-exec-update.sh`
- One-Off-Container `docsops-update-run`
- Bash als **Orchestrator** für In-App-Updates (nicht: Install-Bootstrap)

---

## 3. Technologie: Go

**Entscheidung:** Der Host-Agent wird in **Go** implementiert.

| Kriterium      | Go                                                                           |
| -------------- | ---------------------------------------------------------------------------- |
| Distribution   | Ein **statisches Binary** (`docsops-agent`), keine Node-Runtime auf dem Host |
| Betrieb        | Typisch für Host-Agents (Coolify `coold`, Kubernetes-Komponenten, …)         |
| Docker/Compose | `os/exec` mit strukturiertem Exit-Code-Handling                              |
| Tests          | `go test`, Integrationstests mit Testcontainers oder Shell-Wrapper           |
| Sicherheit     | Kleiner Angriffsvektor, ein Prozess, explizite Dependencies                  |

**Repo-Layout (geplant):**

```text
apps/agent/
  cmd/docsops-agent/main.go      # Entrypoint
  internal/
    api/                         # HTTP-Handler
    orchestrator/                # State Machine, Phasen
    preflight/                   # Checks vor Apply
    compose/                     # docker compose Wrapper
    envfile/                     # docsops.env patchen (truncate-write)
    bundle/                      # Download, Extract, Cache
    state/                       # Persistenz auf Host
  go.mod
```

**Build & Release:**

- CI baut `docsops-agent` für `linux/amd64` und `linux/arm64`
- Binary als Asset im GitHub-Release (`docsops-agent-vX.Y.Z-linux-amd64`) und im Deploy-Bundle unter `bin/docsops-agent`
- Version des Agents ist an Release-Tag gebunden (gleiche Version wie App-Stack)

---

## 4. API-Vertrag (Agent ↔ App)

Der Agent exponiert eine **kleine interne HTTP-API**. Bindung nur an **`127.0.0.1`** oder **Unix-Domain-Socket** (`/run/docsops/agent.sock`) – kein externer Port.

**Auth:** `Authorization: Bearer <DOCSOPS_AGENT_TOKEN>` (wie bisher Sidecar-Token; Env-Umbenennung siehe §10).

### 4.1 Endpoints

#### `GET /v1/status`

Aktueller Agent- und Update-Laufstatus.

**Response 200:**

```json
{
  "agentVersion": "0.1.1",
  "idle": true,
  "run": null
}
```

Während eines Laufs:

```json
{
  "agentVersion": "0.1.1",
  "idle": false,
  "run": {
    "runId": "cmqum9bf1000201ox2dzp84ij",
    "version": "v0.1.1",
    "phase": "pull_images",
    "phaseStartedAt": "2026-06-16T12:00:00Z",
    "startedAt": "2026-06-16T11:58:00Z",
    "finishedAt": null,
    "exitCode": null,
    "error": null,
    "errorCode": null,
    "logTail": "…"
  }
}
```

#### `POST /v1/preflight`

Prüfungen **ohne** destruktive Schritte. Kann vor Backup-Gate oder vor Apply aufgerufen werden.

**Request:**

```json
{ "version": "v0.1.1" }
```

**Response 200 (ok):**

```json
{
  "ok": true,
  "checks": [
    { "code": "disk_space", "ok": true, "message": "12 GiB free on /opt" },
    { "code": "env_writable", "ok": true }
  ]
}
```

**Response 200 (nicht ok):**

```json
{
  "ok": false,
  "checks": [
    { "code": "env_writable", "ok": false, "message": "/etc/docsops/docsops.env is not writable" }
  ]
}
```

#### `POST /v1/apply`

Startet einen Update-Lauf (asynchron). **409** wenn bereits ein Lauf aktiv.

**Request:**

```json
{
  "version": "v0.1.1",
  "runId": "cmqum9bf1000201ox2dzp84ij"
}
```

`runId` = `UpdateRun.id` aus der DB (Korrelation Control Plane ↔ Agent).

**Response 202:**

```json
{ "accepted": true, "version": "v0.1.1", "runId": "cmqum9bf1000201ox2dzp84ij" }
```

#### `POST /v1/cancel` (optional, Phase 3b)

Bricht einen laufenden Lauf ab, soweit sicher (kein halbfertiger `compose up`). Initial **nicht** implementieren; Runbook-Fallback bleibt.

### 4.2 Kompatibilität mit Sidecar (Übergang)

Während der Migration unterstützt der Agent optional die **bestehenden Pfade** als Alias:

| Alt (Sidecar)          | Neu (Agent)      |
| ---------------------- | ---------------- |
| `GET /internal/status` | `GET /v1/status` |
| `POST /internal/apply` | `POST /v1/apply` |

Das Backend (`updaterSidecarClient`) wird zu `hostAgentClient` umbenannt; URL über `DOCSOPS_AGENT_URL`.

---

## 5. State Machine

### 5.1 Business-Ebene (`UpdateRun` in PostgreSQL)

Unverändert für die Admin-UI:

| Status       | Bedeutung                           |
| ------------ | ----------------------------------- |
| `queued`     | Angefordert                         |
| `backing_up` | `maintenance.backup` (`pre_update`) |
| `applying`   | Host-Agent führt Update aus         |
| `succeeded`  | Zielversion läuft                   |
| `failed`     | Fehler (Message aus Agent)          |

**Erweiterung (Prisma):** optionale Felder für feinere UI:

| Feld         | Typ       | Beschreibung                                                                      |
| ------------ | --------- | --------------------------------------------------------------------------------- |
| `agentPhase` | `String?` | Letzte technische Phase vom Agent (z. B. `pull_images`)                           |
| `agentRunId` | `String?` | Redundant zu `id`, falls Agent eigene UUID nutzt (default: gleich `UpdateRun.id`) |

### 5.2 Technische Ebene (Agent, persistiert auf Host)

Datei: `/var/lib/docsops/agent-state.json` (Mode `0600`, Verzeichnis `0700`).

```text
idle
  → preflight
  → download_bundle
  → extract_bundle
  → patch_env
  → pull_images
  → compose_up
  → wait_health
  → verify_version
  → cleanup
  → succeeded | failed
```

Jeder Phasenwechsel:

- schreibt State atomar (temp + rename im **Agent-State-Verzeichnis**, nicht in bind-gemounteten Pfaden)
- hängt strukturierte Log-Zeile an `/var/lib/docsops/agent.log` (JSON Lines)
- setzt `phaseStartedAt`

**Fehler:** `failed` mit `errorCode` (Maschine) + `error` (Mensch).

### 5.3 Error-Codes (Auszug)

| Code                     | Bedeutung                                        |
| ------------------------ | ------------------------------------------------ |
| `PREFLIGHT_FAILED`       | Ein oder mehrere Preflight-Checks fehlgeschlagen |
| `BUNDLE_DOWNLOAD_FAILED` | GitHub-Release nicht erreichbar                  |
| `BUNDLE_EXTRACT_FAILED`  | Tar/Deploy-Dateien defekt                        |
| `ENV_PATCH_FAILED`       | `docsops.env` nicht patchbar                     |
| `COMPOSE_PULL_FAILED`    | `docker compose pull` Exit ≠ 0                   |
| `COMPOSE_UP_FAILED`      | `docker compose up` Exit ≠ 0                     |
| `HEALTH_TIMEOUT`         | Health-URL nach Timeout nicht OK                 |
| `VERSION_MISMATCH`       | Nach Update stimmt `APP_VERSION` / Health nicht  |
| `LOCK_HELD`              | Anderer Update-Lauf aktiv                        |
| `CANCELLED`              | Abbruch (später)                                 |

---

## 6. Preflight

Vor destruktiven Schritten (mindestens vor `extract_bundle` und optional über `POST /v1/preflight` für die UI):

| Check                                             | Code             | Aktion bei Fehler      |
| ------------------------------------------------- | ---------------- | ---------------------- |
| Agent-Token / Config geladen                      | `config`         | Agent startet nicht    |
| Kein paralleler Lauf (`/run/docsops/update.lock`) | `lock`           | 409                    |
| `version` matcht `^v\d+\.\d+\.\d+$`               | `version_format` | 400                    |
| GitHub Release erreichbar (HEAD)                  | `release_exists` | Preflight fail         |
| GHCR erreichbar (optional: manifest probe)        | `registry`       | Warnung oder fail      |
| Freier Speicher `/opt` + `/var/lib/docker`        | `disk_space`     | fail unter Schwellwert |
| `/etc/docsops/docsops.env` lesbar + schreibbar    | `env_writable`   | fail                   |
| `/opt/docsops` existiert                          | `install_dir`    | fail                   |
| `docker` + `docker compose` verfügbar             | `docker`         | fail                   |
| Health-URL konfiguriert                           | `health_url`     | fail                   |

**UI:** Preflight-Ergebnis im Apply-Modal anzeigen, **bevor** Backup startet (optional: separates „Check readiness“).

---

## 7. Idempotenz

| Phase             | Skip wenn …                                                | Sonst    |
| ----------------- | ---------------------------------------------------------- | -------- |
| `download_bundle` | Tarball mit gleicher SHA256 in `/var/lib/docsops/bundles/` | Download |
| `extract_bundle`  | Install-Dir-Marker `DOCSOPS_BUNDLE_VERSION=vX.Y.Z` stimmt  | Extract  |
| `patch_env`       | `DOCSOPS_VERSION` in env bereits Ziel                      | Skip     |
| `pull_images`     | `DOCSOPS_SKIP_IMAGE_PULL=1` (Dev/Test)                     | Skip     |
| `compose_up`      | Services healthy mit Ziel-Images (inspect)                 | `up -d`  |

**Lock:** `/run/docsops/update.lock` enthält `runId` + PID; bei Agent-Start stale Lock erkennen (PID tot → entfernen).

**Resume:** Nach Abbruch (z. B. Netzwerk bei `pull_images`) Fortsetzung ab letzter **erfolgreicher** Phase, nicht von vorn — sofern Zielversion unverändert.

---

## 8. Ablauf In-App-Update (gesamt)

```text
1. Admin: POST /api/v1/admin/updates/apply
2. Backend: UpdateRun (queued) + Wartungsmodus (update)
3. Job maintenance.backup (pre_update)
4. Bei Erfolg: UpdateRun → applying
5. Job maintenance.apply-update:
     POST Agent /v1/apply { version, runId }
6. Job maintenance.watch-update:
     poll GET /v1/status + APP_VERSION
     sync agentPhase → UpdateRun
     bei failed → failUpdateRun + Notification
     bei succeeded → completeUpdateRunSuccess
7. Wartungsmodus aus, Notification update-succeeded
```

**Env patchen:** Agent schreibt `docsops.env` per **truncate-write** (Inhalt in Temp-Datei unter `/var/lib/docsops/`, dann `io.Copy` auf Zieldatei) — **kein** `sed -i` / rename auf bind-gemounteten Pfaden.

**Compose:** Gleiche Befehle wie heute in `common.sh`:

```bash
docker compose --env-file /etc/docsops/docsops.env \
  -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose --env-file /etc/docsops/docsops.env \
  -f docker-compose.yml -f docker-compose.prod.yml up -d [--wait]
```

---

## 9. Sicherheit

| Thema         | Regel                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Docker-Socket | **Nur** im Host-Agent-Prozess, **nicht** in App/Worker                                                                    |
| Netzwerk      | Agent bindet `127.0.0.1` oder Unix-Socket; App erreicht Agent via `host.docker.internal` oder Socket-Mount                |
| Auth          | Bearer-Token, bei Install generiert (`openssl rand -hex 32`), `chmod 600` in `docsops.env`                                |
| Privilegien   | Agent läuft als `root` oder dedizierter User in `docker`-Gruppe (Entscheidung bei Implementierung; Runbook dokumentieren) |
| Scope         | Agent-API nur `status`, `preflight`, `apply` — kein generisches „run arbitrary shell“                                     |

---

## 10. Installation und Upgrade

### 10.1 Neuinstallation (`install-prod.sh`)

1. Bestehende Schritte (Bundle, env, compose up)
2. Binary nach `/usr/local/bin/docsops-agent` (oder `/opt/docsops/bin/`)
3. systemd-Unit `/etc/systemd/system/docsops-agent.service`
4. `DOCSOPS_AGENT_URL` + `DOCSOPS_AGENT_TOKEN` in `docsops.env`
5. `systemctl enable --now docsops-agent`

**Kein** `docsops-updater`-Service mehr im Compose nach Abschluss der Migration.

### 10.2 Bestehende Instanzen

**Strategie (Cattle, nicht Pets):** Kein In-Place-Migrationspfad. VM/Stack löschen und mit aktuellem Release **neu installieren** (`curl | sudo bash`). Daten bleiben nur erhalten, wenn Volumes/Backups bewusst migriert werden.

### 10.3 Env-Variablen (neu / geändert)

| Variable                      | Beschreibung               | Default                            |
| ----------------------------- | -------------------------- | ---------------------------------- |
| **DOCSOPS_AGENT_URL**         | URL für App/Worker → Agent | `http://host.docker.internal:8091` |
| **DOCSOPS_AGENT_TOKEN**       | Bearer-Secret              | _(generiert bei Install)_          |
| **DOCSOPS_AGENT_LISTEN**      | Bind-Adresse               | `127.0.0.1:8091`                   |
| **DOCSOPS_AGENT_STATE_DIR**   | State, Logs, Bundle-Cache  | `/var/lib/docsops`                 |
| **DOCSOPS_AGENT_INSTALL_DIR** | Deploy-Pfad                | `/opt/docsops`                     |
| **DOCSOPS_AGENT_ENV_FILE**    | Env-Datei                  | `/etc/docsops/docsops.env`         |
| **DOCSOPS_AGENT_HEALTH_URL**  | Post-Update-Check          | `http://127.0.0.1/health`          |

**Deprecation:** `DOCSOPS_UPDATER_URL` / `DOCSOPS_UPDATER_TOKEN` — Backend akzeptiert während Übergang beide Namen (Agent-Name bevorzugt).

---

## 11. Backend- und Frontend-Anpassungen

| Bereich                            | Änderung                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `updaterSidecarClient.ts`          | → `hostAgentClient.ts`; `getAgentStatus`, `applyUpdateViaAgent`, `preflightUpdate`                |
| `adminSystemUpdateApplyService.ts` | Agent statt Sidecar                                                                               |
| `adminSystemUpdateWatchService.ts` | Poll `/v1/status`, `agentPhase` in DB                                                             |
| `UpdateRun` (Prisma)               | `agentPhase String?`                                                                              |
| Admin Apply-Modal                  | Preflight-Anzeige, Phasen-Fortschritt (ohne Minuten-Schätzung), bei Fehler `errorCode` + Log-Tail |
| `docker-compose.prod.yml`          | `docsops-updater` entfernen                                                                       |
| CI / `release.yml`                 | Go-Binary bauen und ins Release-Bundle                                                            |

**Runbook:** `scripts/update.sh` bleibt; kann intern `docsops-agent apply --version …` aufrufen, sobald Agent Standard ist.

---

## 12. Tests

| Ebene           | Inhalt                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| **Unit (Go)**   | `envfile` patch, State-Transitions, Preflight-Logik, Idempotenz-Entscheidungen |
| **Unit (TS)**   | `hostAgentClient`, Watch-Service mit gemocktem Agent                           |
| **Integration** | `scripts/local-prod-update-test.sh` gegen Agent statt Sidecar                  |
| **CI**          | `go test ./...` in `apps/agent`; API-Tests unverändert mit Agent-Mock          |

---

## 13. Migrationsphasen (Umsetzung)

### Phase 3a – Agent MVP

- [ ] `apps/agent` Grundgerüst (Go), systemd-Unit, Install-Hook
- [ ] State Machine Phasen bis `succeeded`/`failed`
- [ ] API `/v1/status`, `/v1/apply`, `/v1/preflight`
- [ ] Env-Patch truncate-write, Bundle-Download/Extract (Port aus `common.sh`)
- [ ] Backend: Agent-Client, Sidecar parallel unterstützt (Feature-Flag oder URL-Umschaltung)

### Phase 3b – Sidecar abschalten

- [ ] `docsops-updater` aus Compose entfernen
- [ ] `updater-exec-update.sh` + One-Off-Container entfernen
- [ ] Doku: `install.md`, `Env-und-Config.md`, Runbook
- [ ] Migrationsskript für bestehende VMs

### Phase 3c – UX & Härtung

- [ ] `UpdateRun.agentPhase` + UI-Stepper im Apply-Modal
- [ ] Preflight im Modal vor Backup
- [ ] Resume nach Fehler (gleiche Version)
- [ ] Optional: `POST /v1/cancel`

---

## 14. Abgrenzung (bewusst nicht im Scope)

| Thema                    | Begründung                                               |
| ------------------------ | -------------------------------------------------------- |
| Kubernetes / Helm        | Widerspricht Self-hosted-Einfachheit (§19)               |
| Generischer PaaS-Agent   | Nur DocsOps-Update, kein beliebiges Deploy               |
| Backup/Restore im Agent  | Bleibt im Worker (`maintenance.backup` / `restore`)      |
| Multi-Server / SSH-Fleet | [Plan-Managed-Hosting](Plan-Managed-Hosting.md) Phase 2+ |

---

## 15. Empfohlene Reihenfolge

1. **Hotfix** (parallel, kurzfristig): `patch_env_version` truncate-write in `common.sh` für laufende Sidecar-Instanzen
2. **Plan freigeben** (dieses Dokument)
3. **Phase 3a** implementieren und lokal mit `local-prod-update-test.sh` verifizieren
4. Release mit Agent-Binary; VM-Migration testen
5. **Phase 3b** Sidecar entfernen
6. **Phase 3c** UI und Resume

Siehe [Umsetzungs-Todo §26 Phase 3](Umsetzungs-Todo.md#phase-3--host-agent-go).
