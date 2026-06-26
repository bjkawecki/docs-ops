# Infrastruktur & Deployment

Plan für die technische Umsetzung der internen Dokumentationsplattform (vgl. [Doc-Platform-Konzept](../platform/Doc-Platform-Konzept.md)). Fokus: einfache Installation, Betrieb im internen Netz, optionale Nutzung per VPN.

---

## 1. Open Source & GitHub

- **Ziel:** Plattform ist Open Source, von GitHub herunterladbar, nachvollziehbar und erweiterbar.
- **Umsetzung:**
  - Repository auf GitHub (öffentlich oder als Template).
  - Klare Lizenz (z. B. MIT oder Apache 2.0) im Repo.
  - README mit Kurzbeschreibung, Voraussetzungen, Installations- und Update-Anleitung.
  - Relevante Konfiguration und Skripte im Repo (keine geheimen Defaults).

---

## 2. Installation per Shell-Script

- **Ziel:** Einmalige Installation mit einem Skript, ohne manuelles Zusammenpuzzeln.
- **Umsetzung:**
  - Ein `install.sh` (Bootstrap, `sudo`) und `scripts/install-prod.sh` im Release-Bundle.
  - Skript prüft/installiert Voraussetzungen (Docker, curl, openssl).
  - Lädt Release-Bundle nach `/opt/docsops` (nur `vX.Y.Z`, kein `main`).
  - **Konfiguration:** Secrets in **`/etc/docsops/docsops.env`** (`chmod 600`), **keine** `.env` im Deploy-Verzeichnis; Install-Skript generiert `SESSION_SECRET` und `BACKUP_ENCRYPTION_KEY`, setzt `DOCSOPS_VERSION` / `DOCSOPS_IMAGE_PREFIX`, fragt Admin ab; `BACKUP_ENCRYPTION_KEY` einmal an den Betreiber ausgeben.
  - Start: `docker compose pull` dann `up -d` mit `docker-compose.yml` + `docker-compose.prod.yml` (Images von GHCR).
  - Optional: systemd-Unit mit `EnvironmentFile=/etc/docsops/docsops.env` (Autostart).
  - Dokumentation: [install.md](../install.md), README.

---

## 3. Update aus der App

- **Ziel:** Updates möglichst einfach, idealerweise aus der App heraus anstoßbar.
- **Version:** Single Source of Truth = `version` in Root-`package.json` (SemVer); Image-Build setzt `APP_VERSION` daraus; Runtime nur Env. Release = Git-Tag `vX.Y.Z` + GitHub Release. Details: [Plan-Betrieb-Releases-Backup-Update](Plan-Betrieb-Releases-Backup-Update.md) §1.
- **Phasen:**
  - **Phase 1 (empfohlen zuerst):** Admin-UI zeigt installierte vs. verfügbare Version, „Check for updates“, Verweis auf `./scripts/update.sh` auf dem Server; **Backup-Gate** (Hinweis/Pflicht vor Update, vgl. Abschnitt 8).
  - **Phase 2 (Ein-Klick):** Separater **Updater-Sidecar** – eigener Container neben dem App-Stack (`scripts/update.sh` via One-Off-Container). Die Haupt-App ruft ihn per API an; **nicht** voller Docker-Socket im App-Container (Sicherheit).
  - **Phase 3 (geplant):** **Host-Agent** (`docsops-agent`, Go, systemd auf dem Host) ersetzt Sidecar und Shell-Orchestrierung – [Plan-Host-Agent](Plan-Host-Agent.md).
- **Wichtig:** Daten in Volumes; Rollback = vorheriges Image-Tag. Vollständige Todos: [Umsetzungs-Todo §26](Umsetzungs-Todo.md).

---

## 4. Container: Docker oder Podman

- **Ziel:** App und ggf. weitere Dienste laufen in Containern; Unterstützung für Docker und Podman.
- **Umsetzung:**
  - Eine oder wenige Images (mindestens: App; optional: Datenbank, Reverse Proxy).
  - `docker-compose.yml` (bzw. kompatible Compose-Datei) für den gesamten Stack.
  - Install-Skript erkennt vorhandene Runtime (Docker vs. Podman) und nutzt die passenden Befehle.
  - Optional: `alias docker=podman`-Hinweis in der Doku für Nutzer, die nur Podman haben.
  - Für eine schlanke Dokumentationsplattform reicht typischerweise ein App-Container plus optional ein DB-Container.

---

## 5. Interner HTTP-Server

- **Ziel:** Die App ist ein normaler HTTP-Server, der im internen Netz erreichbar ist.
- **Umsetzung:**
  - App bindet sich an `0.0.0.0:<Port>` (z. B. 8080), damit sie aus dem LAN erreichbar ist.
  - Keine Annahme eines festen Hostnamens; Konfiguration für Basis-URL optional.
  - Im LAN Zugriff z. B. über `http://<server>:8080` oder über Reverse Proxy (Abschnitt 7).

---

## 6. VPN (WireGuard o. Ä.) für Zugriff von außen

- **Ziel:** Zugriff von außerhalb des LANs nur über VPN; konfigurierbar bzw. dokumentiert.
- **Umsetzung:**
  - Die App selbst benötigt keine VPN-Integration. Sie läuft wie in Abschnitt 5; Zugriff von „außen“ erfolgt über VPN-Clients, die sich im internen Netz „einklinken“.
  - **Konfigurierbar** bedeutet hier vor allem: Dokumentation (und ggf. optionale Skripte) zur Einrichtung von WireGuard (oder Tailscale, ZeroTier o. Ä.) auf dem Server und bei den Clients.
  - Optional: Einstellung in der App oder im Reverse Proxy, Zugriff nur aus bestimmten Netzen (z. B. VPN-Subnetz) zu erlauben.

---

## 7. Reverse Proxy als Entry Point

- **Ziel:** Ein zentraler Einstiegspunkt, optional mit TLS; geringer Aufwand auf einem einfachen Server.
- **Umsetzung:**
  - Reverse Proxy (z. B. Caddy oder Traefik) auf dem Host oder als Container auf Port 80/443.
  - Proxy leitet auf den App-Container (z. B. Port 8080) weiter.
  - Vorteile: TLS-Terminierung, zentrale Logs, später einfache Erweiterung um weitere Dienste.
  - **Minimalvariante:** Kein Proxy; App direkt auf Port 80 oder 8080 – ausreichend für reines Intranet ohne HTTPS. Für VPN-Zugriff von außen ist HTTPS empfehlenswert, dann reicht ein Reverse Proxy.

---

## 8. Einfacher Server (Ressourcen)

- **Ziel:** Plattform läuft auf schlichtem Server (z. B. kleiner VPS oder Rechner im LAN), ohne hohe Anforderungen.
- **Umsetzung:**
  - Keine besonderen Hardware-Anforderungen; Ressourcenbedarf der App und ggf. DB dokumentieren.
  - Persistente **Volumes** für Daten und Konfiguration in der Compose-Datei vorsehen.
  - **Backup (Operational):** Ein **Archiv** pro Lauf (`manifest.json` + `pg_dump -Fc` + MinIO-Objekte); kurzer **Wartungsmodus** ohne Writes; Job `maintenance.backup` im **Worker**; Upload im **selben Job** an Admin-Ziele (`s3_compatible`, `ssh`; WebDAV Phase 2). Kein Sidecar. Scheduler + Retention (`BACKUP_RETENTION_COUNT`). Restore zunächst Runbook + Test auf leerem Stack. **Plattform-Export/Import** separater Job + Tab Migration (§4 / §27). Details: [Plan-Betrieb-Releases-Backup-Update](Plan-Betrieb-Releases-Backup-Update.md) §3–§4, Todos [§25](Umsetzungs-Todo.md), [§27](Umsetzungs-Todo.md).
  - **Vor Update:** Backup-Hinweis bzw. -Gate in Admin-UI (§26).

---

## 9. Entwicklungsumgebung

- **Ziel:** Lokal so entwickeln, dass das Verhalten dem Server möglichst nahekommt; Install-Skript testbar machen.
- **Zwei Modi:**
  - **Schnell-Dev (täglich):** Backend und Frontend auf dem Host mit `npm run dev`; nur **PostgreSQL 18 + MinIO** in Docker (z. B. `docker compose up db minio` oder kleines `compose.dev.yml`). Schnell, wenig Ressourcen.
  - **Prod-nah (regelmäßig / vor Release):** Vollständiger Stack mit **Caddy** starten (`docker compose up`). App mit Volume-Mount und Watch (nodemon/tsx); Zugriff über **http://localhost:5000** wie auf dem Server. So werden Proxy, Basis-URL und Routing früh abgeglichen.
- **Umsetzung:** Eine `docker-compose.yml` (oder Basis + Override); Dev-Override mit Volume-Mounts und Dev-Command für die App. Ab Abschnitt 6 (Frontend-Basis): **Caddy routet nach Pfad** – `/api/*` an die App (Backend), `/` an den Frontend-Service (eine Origin, Session-Cookie ohne CORS). Frontend als eigener Service im Stack (Vite-Dev-Server oder Build).

---

## 10. Test des Install-Skripts

- **Problem:** `install.sh` lässt sich auf der lokalen Dev-Maschine nicht realistisch testen (Repo und Dienste sind schon da).
- **Empfehlung:** **Release-CI** (`.github/workflows/release.yml`) auf einem frischen Runner: Images nach GHCR pushen, Bundle extrahieren, `install-prod.sh` mit `docker compose pull`, Health-Check auf Port **8080** (`docker-compose.ci.yml`).
- **Umsetzung:** Install-Test im Release-Workflow nach Tag `v*.*.*`.

---

## 11. Optionale öffentliche Seiten (Landing + Docs, Demo)

- **Ziel:** Öffentliche Präsenz für Marketing und **Live-Demo** auf eigener Instanz (z. B. `docsops.de` + `demo.docsops.de`), getrennt von Self-hosted-Kunden.
- **Kurz:** Landing zunächst **statisch, Deutsch**; Demo **writable** mit **periodischem Reset**; App **i18n EN/DE**; Domains `docsops.de` (Hauptmarke), `docsops.org` (optional OSS/Redirect).
- **Detailplan:** [Plan-Demo-Oeffentlich](Plan-Demo-Oeffentlich.md) (Architektur, Missbrauch/UGC, Domains, Sprache, Go-Live).
- **Umsetzung im Repo:** Feature-Flag `VITE_LANDING_PAGE_ENABLED` optional (integrierte Landing); alternativ statische Seite – siehe [Umsetzungs-Todo §19–§20](Umsetzungs-Todo.md). Release Notes für eingeloggte Nutzer: **§24** (`/whats-new`), nicht die öffentliche Marketing-Seite.

---

## 12. Managed Hosting (optional, später)

DocsOps bleibt **self-hosted-first**. Ein optionales **Managed-Hosting-Angebot** (DocsOps Cloud, ein Server mit vielen Tenant-Instanzen – nicht Coolify-ähnliches Multi-Server-PaaS) ist als **separater Plan** dokumentiert, ohne aktuelle Umsetzungs-Todos: [Plan-Managed-Hosting](Plan-Managed-Hosting.md).

---

## Nächste Schritte (Plan)

- [x] Technologie-Stack festlegen (Sprache/Framework, DB, Reverse Proxy) – siehe [Technologie-Stack](Technologie-Stack.md).
- [ ] Repository-Struktur und `docker-compose.yml` entwerfen (inkl. Dev-Override für Entwicklungsumgebung).
- [x] `install.sh` und `scripts/update.sh` (Release-Bundle + GHCR pull).
- [x] CI Install-Test im Release-Workflow (Bundle + pull + Health-Check).
- [ ] Doku zu VPN (WireGuard o. Ä.) und Reverse Proxy in `docs/` planen.
- [ ] Betrieb: What's new, Backup, Update, Migration – siehe [Plan-Betrieb-Releases-Backup-Update](Plan-Betrieb-Releases-Backup-Update.md) und [Umsetzungs-Todo §24–§27](Umsetzungs-Todo.md).
- [ ] Öffentliche Demo & Domains – siehe [Plan-Demo-Oeffentlich](Plan-Demo-Oeffentlich.md).
