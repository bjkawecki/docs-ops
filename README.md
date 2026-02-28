# Interne Dokumentationsplattform

Plattform für interne Dokumentation: Markdown-Dokumente, Struktur Firma → Abteilung → Team, Kontexte (Projekt, Prozess, Nutzerspace), explizite Rechte und PR/Draft-Workflow.

## Dokumentation

- **Konzept und Architektur:** [docs/platform/](docs/platform/) – Einstieg: [Doc-Platform-Konzept.md](docs/platform/Doc-Platform-Konzept.md). Struktur der Ordner: [docs/platform/README.md](docs/platform/README.md).
- **Umsetzungsplan:** [docs/plan/](docs/plan/) – Technologie-Stack, Infrastruktur & Deployment, [Umsetzungs-Todo](docs/plan/Umsetzungs-Todo.md).

## Voraussetzungen

- **Für Installation/Betrieb:** Docker (mit `docker compose`) oder Podman mit podman-compose.
- **Für Entwicklung:** Node.js (LTS, siehe `.nvmrc`), pnpm (Package Manager).

## Installation

Im Repo-Root ausführen:

```bash
./install.sh
```

Das Skript prüft Docker/Podman und startet den Stack (`docker compose up -d`). Die App ist nach kurzer Startzeit unter **http://localhost:5000/health** erreichbar.

Alternativ manuell: `docker compose up -d`.

## Entwicklungsumgebung

Kurze Anleitung (Makefile, Befehle, wann was): [docs/Development-Anleitung.md](docs/Development-Anleitung.md).

- **Schnell-Dev (täglich):** Nur PostgreSQL 18 und MinIO in Docker, Backend auf dem Host.

  ```bash
  docker compose -f docker-compose.dev.yml up -d
  pnpm --filter backend dev
  ```

  Backend dann unter http://localhost:8080/health.

- **Prod-nah (vor Release):** Vollständiger Stack mit Caddy, App per Volume-Mount und Watch.
  ```bash
  docker compose up
  ```
  Zugriff über http://localhost:5000 (Caddy leitet auf die App weiter).

## MVP und Reihenfolge

- Umsetzung startet mit **Abschnitt 1 (Grundgerüst)** und **Abschnitt 2 (Datenmodell & Backend-Basis)** des [Umsetzungs-Todos](docs/plan/Umsetzungs-Todo.md), danach Auth, Rechte, Kern-API, Frontend, Dokumente-UI (Abschnitte 3–7).
- **Phase 2** (bewusst später): Versionierung & PR-Workflow, PDF-Export, erweiterte Volltextsuche, ggf. Aggregator (Git/SharePoint). Siehe [Umsetzungs-Todo](docs/plan/Umsetzungs-Todo.md) Abschnitte 8–11.

## Branch-Strategie

- **main** als Default-Branch. Optionale Nutzung von **develop** für Integration.
- Änderungen idealerweise über Feature-Branches und Merge/PR in main (oder develop) einpflegen.
