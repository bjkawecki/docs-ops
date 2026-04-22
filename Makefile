# docs-ops – Makefile
# Nutzung: make [Ziel]. Ohne Ziel: make help

.PHONY: help install lint lint-backend lint-frontend format format-check check clean dev build start test up up-fg down down-volumes infra migrate admin-create duplicates-backend duplicates-frontend duplicates-all deadcode-backend deadcode-frontend deadcode-all deadcode-backend-strict deadcode-frontend-strict deadcode-all-strict

JSCPD_MIN_LINES ?= 8
JSCPD_MIN_TOKENS ?= 60
JSCPD_IGNORE ?= "**/node_modules/**,**/dist/**,**/coverage/**,**/generated/**,**/*.test.ts,**/*.test.tsx"
TSPRUNE_BACKEND_IGNORE ?= "(^apps/backend/generated/|\\.test\\.|vitest\\.config\\.ts)"
TSPRUNE_FRONTEND_IGNORE ?= "(\\.test\\.|\\.spec\\.|stories\\.)"
DEADCODE_STRICT ?= 0

# Standard-Ziel: Hilfe anzeigen
help:
	@echo "docs-ops – verfügbare Ziele:"
	@echo ""
	@echo "  make install       Abhängigkeiten installieren (pnpm install)"
	@echo "  make lint         ESLint gesamt (Backend + Frontend)"
	@echo "  make lint-backend ESLint nur für Backend"
	@echo "  make lint-frontend ESLint nur für Frontend"
	@echo "  make format       Prettier ausführen (Dateien anpassen)"
	@echo "  make format-check Prettier nur prüfen (keine Änderungen)"
	@echo "  make check        Lint + Format-Check (wie CI)"
	@echo "  make dev          Backend im Dev-Modus starten (tsx watch)"
	@echo "  make build        Backend bauen"
	@echo "  make start        Backend starten (nach build)"
	@echo "  make test         Backend-Tests ausführen (Vitest)"
	@echo "  make up           Stack starten (docker compose up -d)"
	@echo "  make up-fg        Stack starten im Vordergrund (docker compose up)"
	@echo "  make down         Stack stoppen"
	@echo "  make down-volumes Stack stoppen und Docker-Volumes löschen (frische DB)"
	@echo "  make infra        Nur Postgres + MinIO (Schnell-Dev; docker-compose.dev.yml)"
	@echo "  make migrate      Prisma-Migrationen anwenden (DB-Schema); vor admin-create nötig"
	@echo "  make admin-create Admin anlegen (falls noch keiner); ADMIN_EMAIL/ADMIN_PASSWORD in .env"
	@echo "  make duplicates-backend  Duplikate im Backend prüfen + Markdown-Ranking"
	@echo "  make duplicates-frontend Duplikate im Frontend prüfen + Markdown-Ranking"
	@echo "  make duplicates-all      Beide Duplikat-Checks nacheinander ausführen"
	@echo "  make deadcode-backend    Toten Code im Backend prüfen + Markdown-Report"
	@echo "  make deadcode-frontend   Toten Code im Frontend prüfen + Markdown-Report"
	@echo "  make deadcode-all        Beide Dead-Code-Checks nacheinander ausführen"
	@echo "  make deadcode-backend-strict  Strikter Dead-Code-Report Backend (weniger Rauschen)"
	@echo "  make deadcode-frontend-strict Strikter Dead-Code-Report Frontend (weniger Rauschen)"
	@echo "  make deadcode-all-strict      Strikte Dead-Code-Reports für beide Scopes"
	@echo "  make clean        node_modules und Build-Artefakte entfernen"
	@echo ""

install:
	pnpm install

lint:
	pnpm run lint

lint-backend:
	pnpm exec eslint apps/backend

lint-frontend:
	pnpm exec eslint apps/frontend

format:
	pnpm run format

format-check:
	pnpm run format:check

# Entspricht dem CI-Workflow (Lint + Format-Check)
check: lint format-check

dev:
	pnpm --filter backend dev

build:
	pnpm --filter backend build

start:
	pnpm --filter backend start

test:
	pnpm --filter backend test

up:
	docker compose up -d

up-fg:
	docker compose up

down:
	docker compose down

down-volumes:
	docker compose down -v

infra:
	docker compose -f docker-compose.dev.yml up -d

migrate:
	pnpm --filter backend exec prisma migrate deploy

admin-create:
	pnpm --filter backend run create-admin

duplicates-backend:
	@mkdir -p reports/duplications/backend
	pnpm exec jscpd apps/backend/src --reporters json --output reports/duplications/backend --min-lines $(JSCPD_MIN_LINES) --min-tokens $(JSCPD_MIN_TOKENS) --ignore $(JSCPD_IGNORE)
	node scripts/jscpd-report-to-markdown.mjs --input reports/duplications/backend/jscpd-report.json --output reports/duplications/backend/duplicates-weighted.md --scope backend
	@echo "Fertig: reports/duplications/backend/duplicates-weighted.md"

duplicates-frontend:
	@mkdir -p reports/duplications/frontend
	pnpm exec jscpd apps/frontend/src --reporters json --output reports/duplications/frontend --min-lines $(JSCPD_MIN_LINES) --min-tokens $(JSCPD_MIN_TOKENS) --ignore $(JSCPD_IGNORE)
	node scripts/jscpd-report-to-markdown.mjs --input reports/duplications/frontend/jscpd-report.json --output reports/duplications/frontend/duplicates-weighted.md --scope frontend
	@echo "Fertig: reports/duplications/frontend/duplicates-weighted.md"

duplicates-all: duplicates-backend duplicates-frontend

deadcode-backend:
	@mkdir -p reports/deadcode/backend
	pnpm exec ts-prune -p apps/backend/tsconfig.json -i $(TSPRUNE_BACKEND_IGNORE) > reports/deadcode/backend/ts-prune.txt || true
	pnpm exec knip --reporter json > reports/deadcode/backend/knip-all.json || true
	node scripts/deadcode-report-to-markdown.mjs --scope backend --strict $(DEADCODE_STRICT) --tsprune reports/deadcode/backend/ts-prune.txt --knip reports/deadcode/backend/knip-all.json --output reports/deadcode/backend/deadcode-report.md
	@echo "Fertig: reports/deadcode/backend/deadcode-report.md"

deadcode-frontend:
	@mkdir -p reports/deadcode/frontend
	pnpm exec ts-prune -p apps/frontend/tsconfig.json -i $(TSPRUNE_FRONTEND_IGNORE) > reports/deadcode/frontend/ts-prune.txt || true
	pnpm exec knip --reporter json > reports/deadcode/frontend/knip-all.json || true
	node scripts/deadcode-report-to-markdown.mjs --scope frontend --strict $(DEADCODE_STRICT) --tsprune reports/deadcode/frontend/ts-prune.txt --knip reports/deadcode/frontend/knip-all.json --output reports/deadcode/frontend/deadcode-report.md
	@echo "Fertig: reports/deadcode/frontend/deadcode-report.md"

deadcode-all: deadcode-backend deadcode-frontend

deadcode-backend-strict:
	$(MAKE) deadcode-backend DEADCODE_STRICT=1

deadcode-frontend-strict:
	$(MAKE) deadcode-frontend DEADCODE_STRICT=1

deadcode-all-strict:
	$(MAKE) deadcode-all DEADCODE_STRICT=1

clean:
	rm -rf node_modules
	rm -rf apps/backend/dist apps/backend/node_modules
	rm -rf dist build coverage .turbo
	@echo "Bereinigt."
