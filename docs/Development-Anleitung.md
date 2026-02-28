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

| Komponente        | Schnell-Dev (`make docker-dev` + `make dev`)     | Vollständiger Stack (`make docker-up`) |
| ----------------- | ------------------------------------------------ | -------------------------------------- |
| **PostgreSQL 18** | ✅ in Docker (`postgres:18-alpine`)              | ✅ in Docker                           |
| **MinIO**         | ✅ in Docker                                     | ✅ in Docker                           |
| **Backend**       | ✅ auf dem **Host** (du startest mit `make dev`) | ✅ als Container „app“                 |
| **Caddy**         | ❌ nicht gestartet                               | ✅ Reverse Proxy                       |
| **Frontend**      | ❌ (noch Platzhalter, später auf dem Host)       | ❌ (folgt in Abschnitt 6)              |

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

- **URL:** **http://localhost** (Caddy → Backend auf Port 8080)
- **Läuft:** Postgres, MinIO, Backend (mit Watch), Caddy

**Mit Makefile:** `make docker-up` startet den Stack im Hintergrund (`-d`); ohne `-d` siehst du die Logs im Vordergrund (z. B. Backend-Watch). Für Entwicklung oft praktisch: `docker compose up` (ohne `-d`) in einem Terminal, dann siehst du Caddy- und Backend-Logs.

**Frontend:** Das Frontend ist aktuell noch ein Platzhalter (React/Vite kommt in Abschnitt 6 des Umsetzungsplans). Sobald es existiert, wird entweder:

- ein **Frontend-Dev-Service** in Docker ergänzt (z. B. Vite auf Port 5173) und Caddy routet `/` zum Frontend und z. B. `/api` zum Backend, oder
- du startest Frontend auf dem Host (`pnpm --filter frontend dev`) und erreichst es unter **http://localhost:5173**; Caddy bleibt für Backend unter **http://localhost** zuständig, bis das Routing um Frontend erweitert ist.

**Kurz:** Caddy + Backend in der Entwicklung = `docker compose up` (oder `make docker-up` für Hintergrund). Frontend folgt, sobald die App steht.

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

Gleicher Stack wie im Abschnitt **Caddy + Backend in der Entwicklung starten**: `make docker-up` oder `docker compose up`. Zugriff über **http://localhost**.

## Ohne Makefile (pnpm direkt)

- Root: `pnpm install`, `pnpm run lint`, `pnpm run format`, `pnpm run format:check`
- Backend: `pnpm --filter backend dev` (oder in `apps/backend`: `pnpm run dev`)
- Installation/Start: `./install.sh` im Repo-Root

## Siehe auch

- [README.md](../README.md) – Installation, Entwicklungsumgebung, Branch-Strategie
- [docs/plan/Umsetzungs-Todo.md](plan/Umsetzungs-Todo.md) – Umsetzungsplan und Reihenfolge
