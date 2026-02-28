# Development-Anleitung

Kurze Übersicht: Entwicklungsumgebung, Befehle und wann welches Makefile bzw. welche Skripte genutzt werden.

## Voraussetzungen

- **Node.js** (LTS, siehe `.nvmrc`), **pnpm** (Package Manager, verbindlich)
- **Docker** (mit `docker compose`) oder Podman + podman-compose

## Erste Schritte

```bash
# Abhängigkeiten (einmalig)
make install
# oder: pnpm install
```

## Wann welches Makefile?

| Wo                        | Wann nutzen                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Makefile (Repo-Root)**  | Standard für den Alltag: install, lint, format, check, dev, docker-\* – immer aus dem Root arbeiten.                                                                |
| **apps/backend/Makefile** | Nur wenn du dich gezielt im Backend-Ordner aufhältst und dort `make dev` / `make build` / `make start` ausführen willst. Entspricht `pnpm run dev` etc. im Backend. |

**Empfehlung:** Im Repo-Root arbeiten und `make …` aus dem Root-Makefile nutzen. Das Root-Makefile ruft intern `pnpm --filter backend …` auf.

## Tägliche Entwicklung (Schnell-Dev)

**Was läuft wo?**

| Komponente        | Schnell-Dev (`make docker-dev` + `make dev`)     | Vollständiger Stack (`make docker-up`)      |
| ----------------- | ------------------------------------------------ | ------------------------------------------- |
| **PostgreSQL 18** | ✅ in Docker (`postgres:18-alpine`)              | ✅ in Docker                                |
| **MinIO**         | ✅ in Docker                                     | ✅ in Docker                                |
| **Backend**       | ✅ auf dem **Host** (du startest mit `make dev`) | ✅ als Container „app“                      |
| **Caddy**         | ❌ nicht gestartet                               | ✅ Reverse Proxy                            |
| **Frontend**      | ❌ (optional auf Host; sonst im Stack)           | ✅ als Service, Caddy routet `/` → Frontend |

Schnell-Dev heißt: **Nur** die Datenbanken (Postgres, MinIO) laufen in Docker. Caddy und Backend-Container werden **nicht** gestartet. Du startest Backend (und später Frontend) selbst auf deinem Rechner – damit du sofort Hot-Reload hast und keine Images bauen musst.

1. Ablauf:

   ```bash
   make docker-dev   # startet nur Postgres + MinIO
   make dev          # startet Backend auf dem Host (tsx watch)
   ```

   Backend: **http://localhost:8080/health**

2. Ohne Makefile:

   ```bash
   docker compose -f docker-compose.dev.yml up -d
   pnpm --filter backend dev
   ```

3. **Wenn „Authentifizierung fehlgeschlagen“ (Credentials):** Die Compose-Dateien setzen User `app`, Passwort `app`, DB `docsops` (PostgreSQL 18). Wenn das Volume früher mit anderen Werten angelegt wurde, ignoriert Postgres die aktuellen Umgebungsvariablen. **Fix:** Volume neu anlegen: `docker compose -f docker-compose.dev.yml down -v`, dann `docker compose -f docker-compose.dev.yml up -d`. Für Prisma/Migrationen vom Host: `DATABASE_URL=postgresql://app:app@localhost:5432/docsops` setzen (oder `.env` aus `.env.example` anlegen). Prisma-Befehle **im Backend-Verzeichnis** ausführen: `cd apps/backend`, dann z. B. `pnpm exec prisma migrate dev --name init`. **Nach Schema-Umbau** (z. B. getrennte Kontexte, Tags normalisiert): Zuerst `pnpm exec prisma migrate reset` (DB leeren, Datenverlust), dann `pnpm exec prisma migrate dev --name init` – erzeugt und wendet die neue Init-Migration an.

## Caddy + Backend (+ Frontend) in der Entwicklung starten

Wenn du mit **Caddy** und **Backend** (und später Frontend) unter einer Adresse arbeiten willst – z. B. um Routing wie in Produktion zu testen – startest du den vollständigen Stack. Das **Backend** läuft dann im Container mit Volume-Mount und Watch (Hot-Reload); **Caddy** leitet auf das Backend weiter.

**Ablauf (ein Befehl):**

```bash
docker compose up
```

Dabei wird `docker-compose.override.yml` automatisch geladen: Die App (Backend) läuft als Node-Container mit gemountetem Quellcode und `pnpm --filter backend run dev` – Änderungen am Backend werden also live nachgeladen.

- **URL:** **http://localhost:5000** (Caddy auf Port 5000; routet `/` → Frontend, `/api` → Backend)
- **Läuft:** Postgres, MinIO, Backend (mit Watch), Frontend (Vite-Dev-Server), Caddy

**Mit Makefile:** `make docker-up` startet den Stack im Hintergrund (`-d`); ohne `-d` siehst du die Logs im Vordergrund (z. B. Backend-Watch). Für Entwicklung oft praktisch: `docker compose up` (ohne `-d`) in einem Terminal, dann siehst du Caddy- und Backend-Logs.

**Frontend (Abschnitt 6 – Szenario B):** Ab Abschnitt 6 gilt **eine Origin**: Caddy routet `/api/*` zum Backend und `/` zum Frontend. Das Frontend läuft als eigener Service im Stack (Vite-Dev-Server oder Build). Du erreichst die gesamte App unter **http://localhost:5000** – HTML/JS vom Frontend, API unter `http://localhost:5000/api/v1/...`. Session-Cookie gilt für eine Domain, CORS ist nicht nötig. Optional für reine Host-Entwicklung: Frontend auf dem Host mit `pnpm --filter frontend dev` (dann CORS im Backend für `http://localhost:5173`).

**Kurz:** Vollständiger Stack = `docker compose up`; danach **http://localhost:5000** für App und API (Caddy leitet nach Pfad weiter).

## Qualität vor Commit / wie CI

**Automatisch bei jedem Commit:** Über **Husky** + **lint-staged** werden vor dem Commit nur die gestagten Dateien mit Prettier formatiert und mit ESLint geprüft (und wo möglich automatisch gefixt). Nach einem frischen Clone einmal `pnpm install` ausführen, dann sind die Hooks aktiv.

Manuell (wie im CI):

```bash
make check
```

Führt Lint + Prettier-Check auf dem gesamten Repo aus. Bei Bedarf vorher formatieren:

```bash
make format
```

## Weitere Make-Ziele (Root)

| Ziel                | Beschreibung                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `make install`      | `pnpm install`                                                                            |
| `make lint`         | ESLint                                                                                    |
| `make format`       | Prettier (Dateien anpassen)                                                               |
| `make format-check` | Prettier nur prüfen                                                                       |
| `make check`        | Lint + Format-Check                                                                       |
| `make dev`          | Backend im Dev-Modus (tsx watch)                                                          |
| `make build`        | Backend bauen                                                                             |
| `make start`        | Backend starten (nach build)                                                              |
| `make docker-up`    | Vollständiger Stack (`docker compose up -d`)                                              |
| `make docker-down`  | Stack stoppen                                                                             |
| `make docker-dev`   | Nur Postgres + MinIO in Docker (Backend/Frontend startest du mit `make dev` auf dem Host) |
| `make clean`        | node_modules und Build-Artefakte entfernen                                                |

## Prod-nah testen (vor Release)

Gleicher Stack wie im Abschnitt **Caddy + Backend in der Entwicklung starten**: `make docker-up` oder `docker compose up`. Zugriff über **http://localhost:5000**.

## Ohne Makefile (pnpm direkt)

- Root: `pnpm install`, `pnpm run lint`, `pnpm run format`, `pnpm run format:check`
- Backend: `pnpm --filter backend dev` (oder in `apps/backend`: `pnpm run dev`)
- Installation/Start: `./install.sh` im Repo-Root

## Siehe auch

- [README.md](../README.md) – Installation, Entwicklungsumgebung, Branch-Strategie
- [docs/plan/Umsetzungs-Todo.md](plan/Umsetzungs-Todo.md) – Umsetzungsplan und Reihenfolge
