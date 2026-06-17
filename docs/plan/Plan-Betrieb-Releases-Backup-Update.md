# Betrieb: Releases, Backup, Update

Plan für drei zusammenhängende Betriebs-Features: **What's new** (Release Notes für alle Nutzer), **Backup** (Disaster Recovery für Admins) und **Update** (Versionsverwaltung und Upgrade-Pfad für Admins). Ergänzt [Infrastruktur & Deployment](Infrastruktur-und-Deployment.md); Umsetzungsschritte in [Umsetzungs-Todo §24–§26](Umsetzungs-Todo.md).

---

## 1. Versionierung (gemeinsame Basis)

- **Single Source of Truth:** `version` in der Root-`package.json` (SemVer, z. B. `0.2.0`).
- **Deploy:** Beim Image-/Stack-Build als `APP_VERSION` ins Backend (z. B. `GET /api/v1/system/version`).
- **Release:** Git-Tag `v0.2.0`, GitHub Release, `scripts/update.sh` zieht diesen Tag bzw. Release-Artefakt.
- **Release Notes:** Markdown pro Version unter `content/releases/0.2.0.md` plus `content/releases/manifest.json` (Version, Datum, Titel) — wird mit der App ausgeliefert.
- **Nummer bestimmen:** manuell beim Release (Patch/Minor/Major nach SemVer); optional später Tooling (Changesets / semantic-release).

---

## 2. What's new (`/whats-new`)

**Ziel:** Alle eingeloggten Nutzer sehen, was in der installierten bzw. neueren Versionen neu ist — getrennt von **Help** (Bedienhilfe unter `/help/*`).

### Inhalt & Quelle

- **Nicht** als freie CMS-Inhalte nur in der DB (Drift zur deployten Version).
- **Primär:** versionierte Markdown-Dateien im Repo (`content/releases/*.md`), beim Build eingebunden oder vom Backend aus dem Image gelesen.
- **Rendering:** `react-markdown` (wie bei anderen Markdown-Inhalten im Frontend).
- **API (optional):** `GET /api/v1/releases` — Liste aus Manifest + Markdown-Inhalt; `GET /api/v1/system/version` — aktuelle `APP_VERSION`.

### Navigation & UX

- Route **`/whats-new`** (eigene URL, nicht unter `/help`).
- **Account-Menü** (Sidebar unten): erster Eintrag **What's new** (vor Admin / Help / Settings).
- **Badge „Neu“:** `userPreferences.lastSeenReleaseVersion` (PATCH über `/api/v1/me/preferences`) — Badge, solange installierte Version neuer ist als zuletzt gesehen.

### Abgrenzung

- **Help** = wie nutze ich DocsOps (Organisation, Rechte, Workflow).
- **What's new** = Produkt-/Release-Changelog.
- Optionale öffentliche Demo-Docs (`/docs`, §19) bleiben separat (Landing/Demo-Flag).

---

## 3. Backup (Operational Backup)

**Ziel:** Disaster Recovery und Wiederherstellung nach Fehlbedienung — **wieder einspielbar** als Ganzes (DB + Dateien). **Nicht** dasselbe wie Plattform-Export/Migration (siehe §4).

### Architektur

- **Eigener Job-Typ** `maintenance.backup` (pg-boss) — **nicht** Untertask von `maintenance.cleanup`.
- Ausführung im **Worker**-Prozess (gleiches Image wie API, Entrypoint `worker.ts`) — **kein Sidecar** für Backup v1. Sidecar nur für Update Phase 2 (Docker-Socket), vgl. §5.
- Worker-Image: zusätzlich `postgresql-client` (`pg_dump` / `pg_restore` für Runbook).

### Backup-Bundle (ein Archiv pro Lauf)

Dump und MinIO-Objekte werden **nicht** lose abgelegt, sondern als **ein versioniertes Archiv** mit Manifest:

```text
docsops-backup-<backupId>-<timestamp>.tar.zst
├── manifest.json       # Format-Version, Zeitstempel, APP_VERSION, Checksummen
├── postgres/
│   └── dump.custom     # pg_dump -Fc (Custom Format)
└── minio/
    └── objects/        # Export relevanter Bucket-Keys (Anhänge, Exporte, …)
```

`manifest.json` enthält u. a. `backupFormatVersion`, Größen, SHA-256 pro Teil und über das Gesamtarchiv. Job-Status `succeeded` erst nach erfolgreicher Prüfsummenbildung.

Secrets (`.env`, Session-Secret) **nicht** im Bundle; Restore-Runbook verweist auf separate sichere Ablage.

### Konsistenz (Wartungsmodus)

Kurz **Wartungsmodus** während der Erstellung: **keine Schreibzugriffe** auf die Plattform, dann `pg_dump` und MinIO-Export, danach Archiv bauen. So bleiben DB und Dateien zusammenpassend. Reads optional erlaubt oder komplett gesperrt — in der Implementierung festlegen und dokumentieren.

### Job-Ablauf (ein Prozess)

Alles in **einem** `maintenance.backup`-Handler, sequenziell:

1. Wartungsmodus an
2. `pg_dump` + MinIO-Export → temporäres Archiv + `manifest.json` + Checksummen
3. **Upload** an konfiguriertes Admin-Ziel (falls gesetzt) — im **selben Job**, direkt im Anschluss
4. Metadaten in DB (Status, Größe, Ziel, Remote-Pfad, Checksum)
5. Optional: Webhook(s) bei Erfolg/Fehler (nur Metadaten, s. u.)
6. Temporäre Dateien aufräumen; Wartungsmodus aus

Optional: zusätzliche Kopie im lokalen MinIO-Bucket `backups/` und **Download** per presigned URL — nur wenn gewünscht (Offsite-Ziel ist der Normalfall für DR).

**Audit** (wer, wann, Größe, Status, Ziel) — analog Admin-Jobs.

Admin: **Create backup** → `POST /api/v1/admin/backups`.

### Externe Ziele (Admin-konfigurierbar)

Admins legen **Backup destinations** an (Credentials verschlüsselt in der DB, nur `requireAdmin`). Upload = **Push vom Worker** (kein „Empfangs-Endpunkt“ beim Anbieter).

| Typ                  | v1      | Umsetzung                                                                              |
| -------------------- | ------- | -------------------------------------------------------------------------------------- |
| **`s3_compatible`**  | ja      | AWS SDK (`PutObject` mit Stream) — gleiche Basis wie MinIO-Anbindung                   |
| **`ssh`** (SFTP/scp) | ja      | SSH-Host, User, Key/Passwort, Zielpfad — nativ im Worker (z. B. `ssh2`), kein `rclone` |
| **`webdav`**         | Phase 2 | HTTP `PUT` nach Archiv (Nextcloud o. Ä.) — gleicher Job-Ablauf wie S3/SSH              |

**Kein `rclone` im Image (v1):** Spart extra Binary, Subprocess-Debugging und generische Remote-Configs; S3 + SSH decken Self-hosted ab. `rclone` nur erwägen, wenn später viele Cloud-Anbieter ohne eigene Integration nötig sind.

SSRF-Schutz bei konfigurierbaren URLs (keine internen Ziele, nur `https`/`sftp` wo sinnvoll).

### Webhook (optional, v1)

Pro Destination oder global: **HTTPS-URL**, die bei Erfolg/Fehler ein **JSON-Event** erhält (`backupId`, `status`, `size`, `checksum`, `finishedAt`, optional zeitlich begrenzte `downloadUrl`). **Kein** Upload der Backup-Datei über den Webhook — nur Benachrichtigung oder Trigger für externe Automation. HMAC-Signatur (`X-DocsOps-Signature`) empfohlen.

### Automatik & Retention

- Scheduler (Cron über pg-boss): Intervall konfigurierbar (Env / Admin-UI).
- `BACKUP_RETENTION_COUNT` (z. B. 7): älteste Backups am **konfigurierten Ziel** und in der Metadaten-Liste löschen.
- Admin-UI: Destinations verwalten, Backups anstoßen, Liste, Status, Download (falls lokale Kopie).

### Restore

**Phase 1:** dokumentiertes **Runbook** (manuell): Wartungsmodus → Archiv entpacken → Manifest/Checksums prüfen → `pg_restore` → MinIO-Objekte zurück → App starten → Health/Reindex. **Restore einmal testen** (leerer Stack), bevor Produktion darauf vertraut.

**Phase 2:** optionale Admin-Aktion „Restore from backup“ mit Wartungsmodus in der UI.

---

## 4. Plattform-Export (später, separates Feature)

**Ziel:** DocsOps auf einem **anderen** Server importieren (Umzug, Klon für Test).

- Strukturiertes Archiv: Organisation, Teams, Nutzer (Passwort-Policy klären), Rechte, Dokumente, Kontexte, Dateien.
- Versioniertes Import-Format + Skript — **nicht** mit täglichem Operational Backup vermischen.
- Seltener, explizit angestoßen; eigener Admin-Bereich oder Job-Typ.

---

## 5. Update (Admin)

**Ziel:** Admins sehen installierte vs. verfügbare Version und können Updates kontrolliert anstoßen.

### Phase 1 (empfohlen zuerst)

- Admin-Route z. B. **`/admin/system`** (Tab oder Seite neben Users/Teams/…).
- Anzeige: `APP_VERSION` (installiert) vs. neueste Version (GitHub Releases API oder mitgelieferte `version.json`).
- Aktionen: **Check for updates**, Anzeige von `./scripts/update.sh` / Runbook-Link.
- **Backup-Gate:** Hinweis bzw. Pflicht „Backup vor Update“ mit Link zur Backup-UI.

### Phase 2 (Ein-Klick-Update)

- **Nicht** das Haupt-App-Backend mit vollem Docker-Socket auf dem Host betreiben.
- Separater **Updater-Sidecar** (eigener Container/Agent): App ruft nur `POST /api/v1/admin/updates/apply` → Sidecar führt `git pull`, `docker compose pull`, `docker compose up -d` aus.
- Sidecar = „Begleit-Container“ mit begrenzten Rechten (nur Update-Skript, kein vollständiger App-Zugriff).
- Wartungsmodus + Health-Check nach Update; Rollback-Doku (vorheriges Image-Tag).

Siehe auch [Infrastruktur §3](Infrastruktur-und-Deployment.md#3-update-aus-der-app).

---

## 6. Empfohlene Reihenfolge

1. **Backup v1** (§25): Bundle + Wartungsmodus + `maintenance.backup` + Admin-Destinations (S3, SSH) + Upload im selben Job + Runbook/Restore-Test
2. Version-API + Release-Manifest + `/whats-new` + Menü/Badge (§24; kann parallel zu Backup)
3. Update UI Phase 1 + `update.sh` (§26; Backup-Gate)
4. Backup Phase 2: Restore-UI, WebDAV-Ziel, optional Webhook-Härtung
5. Plattform-Export (separates Feature)
6. Update Phase 2 (Updater-Sidecar)

Siehe auch [Infrastruktur §12](Infrastruktur-und-Deployment.md) (Managed Hosting, optional, später).

---

## 7. Env-Variablen (Entwurf)

| Variable                 | Bedeutung                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `APP_VERSION`            | Aus Build/`package.json`                                                                  |
| `BACKUP_RETENTION_COUNT` | Max. Anzahl behaltener Backups (pro Destination / global — bei Implementierung festlegen) |
| `BACKUP_SCHEDULE_CRON`   | Optional, Scheduler für automatische Backups                                              |
| `UPDATE_CHECK_URL`       | Optional, URL für Versionsabfrage (Default: GitHub Releases)                              |

Backup-Ziele (S3-Endpoint, SSH-Host, …) primär **in der DB** über Admin-Destinations, nicht als flache Env-Liste. Details in [Env-und-Config](Env-und-Config.md), sobald implementiert.
