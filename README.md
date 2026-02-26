# Interne Dokumentationsplattform

Plattform für interne Dokumentation: Markdown-Dokumente, Struktur Firma → Abteilung → Team, Kontexte (Projekt, Prozess, Nutzerspace), explizite Rechte und PR/Draft-Workflow.

## Dokumentation

- **Konzept und Architektur:** [docs/platform/](docs/platform/) – Einstieg: [Doc-Platform-Konzept.md](docs/platform/Doc-Platform-Konzept.md). Struktur der Ordner: [docs/platform/README.md](docs/platform/README.md).
- **Umsetzungsplan:** [docs/plan/](docs/plan/) – Technologie-Stack, Infrastruktur & Deployment, [Umsetzungs-Todo](docs/plan/Umsetzungs-Todo.md).

## Voraussetzungen (geplant)

- Node.js (LTS, siehe `.nvmrc`)
- pnpm (Package Manager)
- Docker oder Podman (für Installation und Betrieb)

## Installation (geplant)

Die Installation wird über ein Shell-Skript (`install.sh`) und Docker Compose erfolgen. Anleitung folgt mit der Umsetzung.

## Branch-Strategie

- **main** als Default-Branch. Optionale Nutzung von **develop** für Integration.
- Änderungen idealerweise über Feature-Branches und Merge/PR in main (oder develop) einpflegen.
