# Backend – Makefile (aus apps/backend/)
# Alternativ: make-Ziele aus Repo-Root (pnpm --filter backend)

.PHONY: help dev build start test duplicates

help:
	@echo "Backend: make dev | build | start | test | duplicates"

dev:
	pnpm run dev

build:
	pnpm run build

start:
	pnpm run start

test:
	pnpm run test

duplicates:
	$(MAKE) -C ../.. duplicates-backend
