# docs-ops – Makefile
# Nutzung: make [Ziel]. Ohne Ziel: make help

.PHONY: help install lint format format-check check clean

# Standard-Ziel: Hilfe anzeigen
help:
	@echo "docs-ops – verfügbare Ziele:"
	@echo ""
	@echo "  make install      Abhängigkeiten installieren (pnpm install)"
	@echo "  make lint        ESLint ausführen"
	@echo "  make format      Prettier ausführen (Dateien anpassen)"
	@echo "  make format-check Prettier nur prüfen (keine Änderungen)"
	@echo "  make check       Lint + Format-Check (wie CI)"
	@echo "  make clean       node_modules und Build-Artefakte entfernen"
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

clean:
	rm -rf node_modules
	rm -rf dist build coverage .turbo
	@echo "Bereinigt."
