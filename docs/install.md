# Installation (Production, Intranet)

Anleitung für **Self-hosted** DocsOps auf einem Linux-Server im Intranet. Entwicklung und „prod-nah“ lokal: [Development-Anleitung](Development-Anleitung.md) (Port 5000, `docker-compose.override.yml`).

Geplanter Ablauf (Umsetzung §19): `sudo ./install.sh` – Details in [Umsetzungs-Todo §19](plan/Umsetzungs-Todo.md#19-deployment--doku).

---

## Konfiguration: Dev vs. Production

|                      | **Entwicklung**                                   | **Production (Stufe 2)**                                       |
| -------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Code                 | Git-Clone beliebig                                | `/opt/docsops` (Default)                                       |
| Secrets/Konfig       | `.env` im **Repo-Root** (aus `.env.example`)      | **`/etc/docsops/docsops.env`** – **nicht** im Clone            |
| Compose              | `docker-compose.yml` + `override` → Port **5000** | `docker-compose.yml` + `docker-compose.prod.yml` → Port **80** |
| Wer legt Secrets an? | Entwickler manuell                                | **Install-Skript** (generiert + Admin-Abfragen)                |

In Production brauchst du **keine `.env` im Repository-Verzeichnis**. Das Install-Skript erzeugt stattdessen eine zentrale Env-Datei auf dem Host. Docker Compose bezieht Variablen daraus (`--env-file` oder systemd `EnvironmentFile`).

---

## Stufe 2: Trennung Code und Secrets

**Ziel:** Updates (`git pull` in `/opt/docsops`) ohne Secrets im Arbeitsbaum; bootfeste Konfiguration.

### Pfade

```text
/opt/docsops/                    Git-Clone (Compose, Caddyfile, Images bauen)
/etc/docsops/docsops.env         Secrets + Install-Konfig (root:root, chmod 600)
/etc/systemd/system/docsops.service   optional: Autostart nach Reboot
```

### Inhalt von `/etc/docsops/docsops.env` (vom Install-Skript)

Das Skript legt die Datei an – **nicht** manuell vorbereiten. Typische Einträge:

| Variable                         | Herkunft                              | Admin muss kennen?       |
| -------------------------------- | ------------------------------------- | ------------------------ |
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
  -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

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

```bash
# Aus Release-Clone auf dem Server (empfohlen: DOCSOPS_VERSION=vX.Y.Z)
sudo ./install.sh

# Optional: systemd-Autostart registrieren
sudo ./install.sh --install-systemd

# Bootstrap von GitHub (Release-Tag empfohlen)
curl -fsSL https://raw.githubusercontent.com/bjkawecki/docs-ops/main/install.sh | sudo bash
```

**Non-interactive** (CI/Automation):

```bash
export DOCSOPS_NON_INTERACTIVE=1 DOCSOPS_ASSUME_YES=1
export ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='min-12-chars'
sudo -E ./scripts/install-prod.sh
```

Voraussetzungen: `sudo`, Linux-Server im Intranet; das Skript installiert bei Bedarf Docker, git, curl, openssl.

Flags: `--reconfigure` (neue Secrets), `--install-systemd`, Hilfe via `--help`.

**CI:** `docker-compose.ci.yml` mappt Caddy auf Port **8080** (`DOCSOPS_EXTRA_COMPOSE_FILES`, `DOCSOPS_HEALTH_URL=http://127.0.0.1:8080/health`).

---

## Siehe auch

- [Infrastruktur & Deployment](plan/Infrastruktur-und-Deployment.md)
- [Env- und Config](plan/Env-und-Config.md)
- [Runbook Backup/Restore](plan/Runbook-Backup-Restore.md)
