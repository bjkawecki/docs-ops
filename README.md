# DocsOps

Interne Dokumentationsplattform (Firma → Abteilung → Team, Markdown-Dokumente, Rechte, PR/Draft-Workflow).

## Dokumentation

- **Konzept:** [docs/platform/](docs/platform/)
- **Umsetzungsplan:** [docs/plan/](docs/plan/)

## Voraussetzungen

- Docker (mit `docker compose`) oder Podman mit podman-compose
- Für Entwicklung: Node.js (`.nvmrc`), pnpm

## Installation

```bash
./install.sh
```

Startet den Stack. App nach kurzer Startzeit unter **http://localhost:5000** (Health: http://localhost:5000/health).

Manuell: `docker compose up -d`.

## Entwicklung

Siehe [docs/Development-Anleitung.md](docs/Development-Anleitung.md).
