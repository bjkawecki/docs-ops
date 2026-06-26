# Installation (Production, Intranet)

Anleitung für **Self-hosted** DocsOps auf einem Linux-Server im Intranet. Entwicklung und „prod-nah“ lokal: [Development-Anleitung](Development-Anleitung.md) (Port 5000, `docker-compose.override.yml`).

**Deployment:** Release-Bundle + Container-Images von **GHCR** (`docker compose pull`). Kein Git-Clone, kein `docker compose build` auf dem Server.

**Deployment-Annahme:** Production = **Intranet-Self-hosted** auf einem Linux-Host. Standard ist **HTTP Port 80** (Caddy reverse proxy, keine TLS-Pflicht). Clients erreichen DocsOps per Server-IP oder internem Hostnamen (z. B. `docsops.intranet`). Öffentliches Internet oder HTTPS sind **nicht** vorausgesetzt; beides kann später ergänzt werden.

---

## Systemanforderungen

Install lädt vorgebaute Images von der Registry (`docker compose pull`) – typisch **2–5 Minuten** nach Download. **Empfohlen:** 8 GB RAM, 40 GB Disk auf `/` (inkl. Docker).

| Profil      | RAM   | Disk   |                           |
| ----------- | ----- | ------ | ------------------------- |
| Minimum     | 4 GB  | 20 GB  | Lab/Test                  |
| Empfohlen   | 8 GB  | 40 GB  | Intranet-Production       |
| Komfortabel | 16 GB | 80 GB+ | MinIO/Backups wachsen mit |

Host: Linux, `sudo`, Port **80** frei; curl/openssl/Docker bei Bedarf via Skript.

Vor Install: `df -h /`, `free -h` – unter **~4 GB frei** oft `no space left on device`. Dann `docker system prune -af` / Disk vergrößern.

---

## Konfiguration: Dev vs. Production

|                        | **Entwicklung**                                   | **Production**                                                          |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Code                   | Git-Clone (Monorepo)                              | Release-Bundle unter `/opt/docsops` (Compose, Skripte – kein Quellcode) |
| Images                 | lokal gebaut (`docker-compose.override.yml`)      | GHCR: `ghcr.io/bjkawecki/docsops-{app,worker,frontend}:vX.Y.Z`          |
| Secrets/Konfig         | `.env` im **Repo-Root** (aus `.env.example`)      | **`/etc/docsops/docsops.env`**                                          |
| Compose                | `docker-compose.yml` + `override` → Port **5000** | `docker-compose.yml` + `docker-compose.prod.yml` → Port **80** (HTTP)   |
| Zugriff                | localhost                                         | Intranet: IP oder Hostname (z. B. `docsops.intranet`)                   |
| TLS / HTTPS            | nicht nötig (Dev)                                 | **Standard: aus** – optional später (Caddy TLS)                         |
| Session-Cookies        | Dev-Stack                                         | **ohne** `Secure` (HTTP); mit HTTPS: `SESSION_COOKIE_SECURE=1`          |
| Seed-Daten             | automatisch bei leerer DB                         | **nein** (nur Admin via Install)                                        |
| Debug („View as user“) | Dev-Frontend (`import.meta.env.DEV`)              | **nicht** im Production-Build                                           |
| Wer legt Secrets an?   | Entwickler manuell                                | **Install-Skript** (generiert + Admin-Abfragen)                         |

### Production vs. Demo

|                       | **Intranet-Production** (Install-Skript)         | **Demo** (öffentliche Demo-Instanz)  |
| --------------------- | ------------------------------------------------ | ------------------------------------ |
| Compose               | `docker-compose.yml` + `docker-compose.prod.yml` | zusätzlich `docker-compose.demo.yml` |
| `DEMO_MODE`           | **nicht** setzen                                 | `true`                               |
| Seed                  | nein                                             | ja (CSV bei leerer DB)               |
| Debug / Impersonation | nein                                             | nein                                 |

In Production brauchst du **keine `.env` im Deploy-Verzeichnis**. Das Install-Skript erzeugt stattdessen eine zentrale Env-Datei auf dem Host. Docker Compose bezieht Variablen daraus (`--env-file` oder systemd `EnvironmentFile`).

---

## Pfade

```text
/opt/docsops/                    Release-Bundle (Compose, Caddyfile, Install-Skripte)
/etc/docsops/docsops.env         Secrets + DOCSOPS_VERSION / Image-Prefix (root:root, chmod 600)
/etc/systemd/system/docsops.service   optional: Autostart nach Reboot
```

### Inhalt von `/etc/docsops/docsops.env` (vom Install-Skript)

Das Skript legt die Datei an – **nicht** manuell vorbereiten. Typische Einträge:

| Variable                         | Herkunft                              | Admin muss kennen?       |
| -------------------------------- | ------------------------------------- | ------------------------ |
| `DOCSOPS_VERSION`                | Release-Tag (z. B. `v0.1.0`)          | ja (für Updates)         |
| `DOCSOPS_IMAGE_PREFIX`           | Default `ghcr.io/bjkawecki`           | nein                     |
| `SESSION_SECRET`                 | generiert (`openssl rand -hex 32`)    | nein (intern)            |
| `BACKUP_ENCRYPTION_KEY`          | generiert (`openssl rand -base64 32`) | **ja** – separat sichern |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | interaktive Abfrage beim Install      | ja (Login)               |
| `DOCSOPS_HOSTNAME`               | optional (z. B. `docsops.intranet`)   | optional                 |
| `COMPOSE_PROJECT_NAME`           | Default `docsops`                     | nein                     |

**`BACKUP_ENCRYPTION_KEY`:** Das Install-Skript zeigt den Wert **einmal** im Terminal an. Danach nur noch unter `/etc/docsops/docsops.env`. Der Key gehört in einen **Passwortmanager** – er steckt **nicht** in Backup-Archiven. Verlust → gespeicherte Backup-Ziel-Credentials in der DB sind nicht mehr entschlüsselbar. Siehe auch [README – Operational backup](../README.md#operational-backup).

Nach erfolgreicher Admin-Anlage reicht das Passwort als Hash in der Datenbank; `ADMIN_PASSWORD` in der Env-Datei ist nur für den ersten `create-admin`-Lauf nötig (kann später aus der Datei entfernt werden).

### Stack starten (manuell, nach Install)

```bash
cd /opt/docsops
docker compose --env-file /etc/docsops/docsops.env \
  -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose --env-file /etc/docsops/docsops.env \
  -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Update

```bash
sudo /opt/docsops/scripts/update.sh
```

Ohne Argument: neuestes GitHub-Release. Bestimmte Version:

```bash
sudo /opt/docsops/scripts/update.sh v0.2.0
```

Lädt das neue Bundle, aktualisiert `DOCSOPS_VERSION` in `/etc/docsops/docsops.env`, `pull` + `up -d`.

**Lokal testen (ohne GitHub-Release):** Siehe [`scripts/local-prod-update-test.sh`](../scripts/local-prod-update-test.sh) oder manuell mit `DOCSOPS_BUNDLE_PATH=/pfad/docsops-v0.1.1.tar.gz DOCSOPS_SKIP_IMAGE_PULL=1 sudo -E ./scripts/update.sh v0.1.1`.

**Rollback:** Vor dem Update Bundle-Tarball und `/etc/docsops/docsops.env` sichern; bei Problemen alte Version in der Env-Datei setzen, altes Bundle nach `/opt/docsops` entpacken, `docker compose pull && up -d`.

**Admin „Apply update“ (Host-Agent):** `docsops-agent` läuft als **systemd-Dienst auf dem Host** (nicht im Compose-Stack). Die App ruft `POST /v1/apply` über `DOCSOPS_AGENT_URL` an (Standard: `http://host.docker.internal:8091`). Status: `GET /v1/status` mit Bearer `DOCSOPS_AGENT_TOKEN`.

**Agent Troubleshooting:**

```bash
# Agent läuft?
sudo systemctl status docsops-agent
curl -sf -H "Authorization: Bearer $(grep '^DOCSOPS_AGENT_TOKEN=' /etc/docsops/docsops.env | cut -d= -f2-)" \
  http://127.0.0.1:8091/v1/status

# Manuell vom Host (wie update.sh intern):
sudo /opt/docsops/scripts/update.sh v0.1.1

# Agent-Logs (JSON-Lines):
sudo tail -100 /var/lib/docsops/agent.log
```

Hängender Update-Run in der Admin-UI: App neu starten (Reconciliation) oder Agent-Status/Logs prüfen.

**Bestehende VMs vor dem Host-Agent-Release:** Stack löschen und mit aktuellem Release neu installieren (`curl | sudo bash`) — kein In-Place-Migrationspfad.

### Deinstallation

DocsOps vollständig entfernen (Container, Volumes, `/opt/docsops`, `/etc/docsops/docsops.env`, systemd):

```bash
sudo /opt/docsops/scripts/uninstall-prod.sh
```

Alternativ per curl (lädt bei Bedarf das neueste Release-Bundle nur für das Skript):

```bash
curl -fsSL https://github.com/bjkawecki/docs-ops/releases/latest/download/uninstall.sh | sudo bash
```

Das Skript fragt interaktiv nach Bestätigung (`yes`). Optionen:

| Option              | Wirkung                                   |
| ------------------- | ----------------------------------------- |
| `--keep-data`       | DB- und MinIO-Volumes behalten            |
| `--keep-config`     | `/etc/docsops/docsops.env` behalten       |
| `--keep-deploy-dir` | `/opt/docsops` (Compose/Skripte) behalten |
| `--purge-images`    | Container-Images von GHCR/lokal entfernen |

Automation: `DOCSOPS_NON_INTERACTIVE=1 DOCSOPS_ASSUME_YES=1 sudo …/uninstall-prod.sh`

Danach Neuinstallation wie oben mit `install.sh`.

### systemd (optional, Autostart)

Unit-Datei `/etc/systemd/system/docsops.service`:

```ini
[Unit]
Description=DocsOps (Docker Compose)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/docsops
EnvironmentFile=/etc/docsops/docsops.env
ExecStart=/usr/bin/docker compose --env-file /etc/docsops/docsops.env \
  -f docker-compose.yml -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose --env-file /etc/docsops/docsops.env \
  -f docker-compose.yml -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now docsops.service
```

`EnvironmentFile` lädt dieselben Variablen wie `--env-file` – systemd setzt sie für den `docker compose`-Prozess (Substituierung `${…}` in der Compose-Datei).

---

## Persistente Docker-Volumes (Production)

| Volume          | Inhalt                            |
| --------------- | --------------------------------- |
| `postgres_data` | Datenbank                         |
| `minio_data`    | Anhänge, Exporte, Backup-Objekte  |
| `caddy_data`    | optional später (TLS-Zertifikate) |

Secrets liegen in **`/etc/docsops/docsops.env`** auf dem Host, nicht in einem extra Docker-Volume (einfacher zu backuppen und zu dokumentieren).

**Backup:** Operatives Backup (§25) sichert DB + MinIO. **`/etc/docsops/docsops.env`** (mindestens `BACKUP_ENCRYPTION_KEY`) **zusätzlich** sichern – z. B. Passwortmanager + Config-Backup des Servers.

---

## Zugriff im Intranet

- **Ohne Hostname:** `http://<server-ip>/`
- **Mit Hostname:** internes DNS oder `/etc/hosts` auf Client-Rechnern, z. B. `192.168.1.50 docsops.intranet`

Das Install-Skript richtet kein VPN und kein zentrales DNS ein (Hinweis in Doku reicht).

---

## Installation

**Standard (VM / Intranet-Server):**

```bash
curl -fsSL https://github.com/bjkawecki/docs-ops/releases/latest/download/install.sh | sudo bash
```

Lädt das **neueste** Release-Bundle nach `/opt/docsops`, installiert bei Bedarf Docker und startet DocsOps auf **Port 80**. Nur **Release-Tags** (`vX.Y.Z`) – kein Branch `main`. Die Version ist im heruntergeladenen `install.sh` eingebettet (Skript, Bundle und Images passen zusammen).

**Bestimmte Version (Pinning):**

```bash
curl -fsSL https://github.com/bjkawecki/docs-ops/releases/download/v0.1.0/install.sh | sudo bash
# oder: DOCSOPS_VERSION=v0.1.0 curl -fsSL …/releases/latest/download/install.sh | sudo bash
```

Beim **Re-Install** erkennt das Skript den DocsOps-Caddy auf Port 80 und fährt mit Update fort. Existiert bereits `/etc/docsops/docsops.env`, fragt **Schritt „Konfiguration“** interaktiv, ob die bestehende Datei beibehalten werden soll (Default: ja). Mit `--reconfigure` oder Antwort **n** werden neue Secrets erzeugt. Bei fremden Webservern auf Port 80 (Apache, nginx, …) vor der Erstinstallation: Dienst stoppen.

**Aus entpacktem Bundle** (z. B. nach manuellem Download von `docsops-vX.Y.Z.tar.gz`):

```bash
export DOCSOPS_VERSION=v0.1.0
sudo ./install.sh
```

**Non-interactive** (CI/Automation):

```bash
export DOCSOPS_VERSION=v0.1.0
export DOCSOPS_NON_INTERACTIVE=1 DOCSOPS_ASSUME_YES=1
export ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='min-6-chars'
sudo -E /opt/docsops/scripts/install-prod.sh
```

Mit bestehender `/etc/docsops/docsops.env` wird diese im Non-interactive-Modus standardmäßig wiederverwendet (`DOCSOPS_USE_EXISTING_CONFIG=1`). Neue Secrets: `DOCSOPS_USE_EXISTING_CONFIG=0` oder `--reconfigure`.

Flags: `--reconfigure` (neue Secrets ohne Rückfrage), `--install-systemd`, Hilfe via `--help`.

**CI:** `docker-compose.ci.yml` mappt Caddy auf Port **8080** (`DOCSOPS_EXTRA_COMPOSE_FILES`, `DOCSOPS_HEALTH_URL=http://127.0.0.1:8080/health`).

---

## Troubleshooting

### Login: `GET /api/v1/me` → 401 nach Anmeldung

Standard-Production läuft auf **HTTP** (Port 80). Session-Cookies dürfen dann **kein** `Secure`-Flag haben – sondern speichert der Browser das Cookie nicht.

- Erst wenn Caddy **HTTPS** terminiert: in `/etc/docsops/docsops.env` `SESSION_COOKIE_SECURE=1` setzen und App neu starten.
- Im Browser (DevTools → Application → Cookies): nach Login muss `sessionId` für `docsops.intranet` sichtbar sein.
- Ein 401 auf `/me` **vor** dem Login (Login-Seite) ist normal.

### `docker compose pull` schlägt fehl

- `DOCSOPS_VERSION` in `/etc/docsops/docsops.env` muss ein existierendes Release sein (`vX.Y.Z`).
- Server braucht ausgehenden HTTPS-Zugriff auf `ghcr.io`.

---

## Siehe auch

- [Infrastruktur & Deployment](plan/Infrastruktur-und-Deployment.md)
- [Env- und Config](plan/Env-und-Config.md)
- [Runbook Backup/Restore](plan/Runbook-Backup-Restore.md)
