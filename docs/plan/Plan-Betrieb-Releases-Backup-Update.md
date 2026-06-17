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

**Ziel:** Disaster Recovery auf demselben Server bzw. Wiederherstellung nach Fehlbedienung — **nicht** dasselbe wie Plattform-Export/Migration (siehe §4).

### Umfang Phase 1

| Bestandteil                                         | Warum                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| **PostgreSQL** (`pg_dump`, Custom-Format empfohlen) | Nutzer, Rechte, Dokumente, Metadaten, Jobs, …                              |
| **MinIO** (Bucket-Snapshot / synchroner Export)     | Anhänge, PDF-Exporte, generierte Dateien — **DB-Dump allein reicht nicht** |

Secrets (`.env`, Session-Secret) **nicht** ins Backup-Bundle; Restore-Doku verweist auf separate sichere Ablage.

### Ablauf

- Async-Job über **pg-boss** (analog `maintenance.cleanup`): z. B. `maintenance.backup`.
- Admin: **Jetzt sichern** → `POST /api/v1/admin/backups`.
- Ergebnis: Archiv in MinIO-Bucket `backups/` (lokal am Stack); optional **Download** per presigned URL nach Abschluss.
- **Audit** (wer, wann, Größe, Status) — analog Admin-Jobs.

### Automatik & Retention

- Scheduler (Cron über pg-boss): Intervall konfigurierbar (Env / Admin-UI).
- `BACKUP_RETENTION_COUNT` (z. B. 7): älteste Backups automatisch löschen.
- Admin-UI: Liste, Status, manuell löschen, Download.

### Offsite (Phase 2)

- Kopie des Backup-Archivs auf **zweites Ziel** (S3, NFS, `rclone`, zweiter MinIO) — Schutz bei Totalausfall des Servers (lokale MinIO-Backups sterben mit dem Host).
- Env z. B. `BACKUP_OFFSITE_TARGET`; Job schreibt lokal und repliziert.

### Restore (Phase 2)

- Admin-Aktion oder dokumentiertes Skript; Wartungsmodus während Restore; nicht in Phase 1 UI-Pflicht.

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

1. Version-API + Release-Manifest + `/whats-new` + Menü/Badge
2. Operational Backup (manuell + Scheduler + Retention + MinIO)
3. Update UI Phase 1 + `update.sh`
4. Offsite-Backup
5. Plattform-Export
6. Update Phase 2 (Updater-Sidecar)

Siehe auch [Infrastruktur §12](Infrastruktur-und-Deployment.md) (Managed Hosting, optional, später).

---

## 7. Env-Variablen (Entwurf)

| Variable                 | Bedeutung                                                    |
| ------------------------ | ------------------------------------------------------------ |
| `APP_VERSION`            | Aus Build/`package.json`                                     |
| `BACKUP_RETENTION_COUNT` | Max. Anzahl behaltener Backups                               |
| `BACKUP_SCHEDULE_CRON`   | Optional, Scheduler für automatische Backups                 |
| `BACKUP_OFFSITE_TARGET`  | Phase 2, Ziel-URI für Replikation                            |
| `UPDATE_CHECK_URL`       | Optional, URL für Versionsabfrage (Default: GitHub Releases) |

Details später in [Env-und-Config](Env-und-Config.md) eintragen, sobald implementiert.
