# Umgebungsvariablen und Konfiguration

Übersicht der Konfiguration für die interne Dokumentationsplattform. Keine echten Werte oder Secrets im Repo; nur Namen und kurze Beschreibung. Siehe [Technologie-Stack](Technologie-Stack.md), [Infrastruktur & Deployment](Infrastruktur-und-Deployment.md).

---

## Umgebungsvariablen (geplant)

| Variable                    | Beschreibung                                         | Beispiel (nur Format)                     |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| **DATABASE_URL**            | PostgreSQL-Verbindungs-URL                           | `postgresql://user:pass@host:5432/dbname` |
| **LOG_LEVEL**               | Optional: Log-Level für Pino (Backend)               | `info`, `debug`, `warn`                   |
| **SESSION_SECRET**          | Geheimnis für Session-Cookie (Signatur/Verifikation) | Lang genug, zufällig                      |
| **SESSION_MAX_AGE_SECONDS** | Optional: Session-Laufzeit in Sekunden               | z. B. `604800` (7 Tage)                   |
| **MINIO_ENDPOINT**          | MinIO-URL (S3-kompatibel)                            | `http://minio:9000`                       |
| **MINIO_ACCESS_KEY**        | MinIO Access Key                                     | —                                         |
| **MINIO_SECRET_KEY**        | MinIO Secret Key                                     | —                                         |
| **MINIO_BUCKET**            | Bucket-Name für Anhänge/Exporte                      | z. B. `documents`                         |
| **LDAP_URL**                | Optional: LDAP/AD für SSO                            | `ldap://…`                                |
| **OIDC_ISSUER**             | Optional: OIDC Issuer für SSO                        | —                                         |

- Alle Werte über Umgebung oder `.env` (nicht committen; `.env.example` ohne echte Secrets möglich).
- Docker Compose: Variablen aus `env_file` oder `environment` in den Service-Definitionen.

---

## Auth-Ablauf (kurz)

- **Login:** Nutzer meldet sich an (Formular/API). Backend prüft Credentials (lokal oder LDAP/OIDC) und erstellt eine **Session** (Eintrag in Postgres, Session-ID im httpOnly-Cookie).
- **Frontend:** Erhält Session-Cookie (httpOnly, Secure, SameSite=Strict); sendet bei API-Requests das Cookie mit; kein Token in Memory/localStorage nötig.
- **Logout:** Backend löscht Session in Postgres und entfernt Cookie.
- **Geschützte Routen:** Backend prüft bei jedem Request Session (Cookie → Lookup in Postgres); bei ungültig/abgelaufen → `401`. Danach Rechteprüfung (`canRead`/`canWrite`) für ressourcenbezogene Aktionen → bei fehlender Berechtigung `403`.

---

## Validierung und XSS

- **Eingaben:** Alle Request-Bodies und Parameter mit **Zod** validieren; ungültige Werte → `400` mit Fehlerdetails.
- **Markdown-Rendering:** Beim Ausliefern von gerendertem Markdown (HTML) **XSS-Schutz** sicherstellen: sichere Markdown-Library (z. B. mit Sanitizing) oder nachträgliches Sanitizing (z. B. DOMPurify auf dem Frontend oder entsprechende Lib im Backend). Kein ungefiltertes HTML aus Nutzerinhalt ausliefern.
