# DocsOps

Interne Dokumentationsplattform .

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

Startet den Stack. App nach kurzer Startzeit unter **http://localhost:5000** (Health: http://localhost:5000/health). Optional: Vite direkt unter **http://localhost:5173** (gleiches Repo; API per Proxy zum Backend).

Manuell: `make up` oder `docker compose up -d`.

## Entwicklung

Siehe [docs/Development-Anleitung.md](docs/Development-Anleitung.md).
