# docs-ops – Makefile
# Nutzung: make [Ziel]. Ohne Ziel: make help

.PHONY: help install lint format format-check check clean dev build start test docker-up docker-down docker-dev

# Standard-Ziel: Hilfe anzeigen
help:
	@echo "docs-ops – verfügbare Ziele:"
	@echo ""
	@echo "  make install       Abhängigkeiten installieren (pnpm install)"
	@echo "  make lint         ESLint ausführen"
	@echo "  make format       Prettier ausführen (Dateien anpassen)"
	@echo "  make format-check Prettier nur prüfen (keine Änderungen)"
	@echo "  make check        Lint + Format-Check (wie CI)"
	@echo "  make dev          Backend im Dev-Modus starten (tsx watch)"
	@echo "  make build        Backend bauen"
	@echo "  make start        Backend starten (nach build)"
	@echo "  make test         Backend-Tests ausführen (Vitest)"
	@echo "  make docker-up    Stack starten (docker compose up -d)"
	@echo "  make docker-down  Stack stoppen"
	@echo "  make docker-dev   Nur Postgres + MinIO (Schnell-Dev)"
	@echo "  make clean        node_modules und Build-Artefakte entfernen"
	@echo ""

install:
	pnpm install

lint:
	pnpm run lint

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

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-dev:
	docker compose -f docker-compose.dev.yml up -d

clean:
	rm -rf node_modules
	rm -rf apps/backend/dist apps/backend/node_modules
	rm -rf dist build coverage .turbo
	@echo "Bereinigt."
