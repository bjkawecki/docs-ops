# Erwartet Build-Kontext: Repo-Root (docker build -f apps/backend/Dockerfile .)
# Targets: migrate (Prisma deploy) | app (API) | worker (PDF-Export via pandoc/typst)
# Build
FROM node:24-alpine AS builder
RUN corepack enable pnpm
WORKDIR /app
# Hoisted node_modules so binaries (prisma, tsc) are in PATH when running from any package
RUN echo "node-linker=hoisted" > .npmrc
ENV HUSKY=0
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY apps/backend ./apps/backend
# Root devDependencies (eslint, husky, …) are for local/CI only – not production image builds.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.devDependencies;if(p.scripts)delete p.scripts.prepare;fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"
RUN pnpm install --filter backend... --no-frozen-lockfile
RUN pnpm --filter backend run build
RUN pnpm deploy --filter backend --prod --legacy /app/deploy
RUN set -eux; \
  MIGRATE_DIR=/app/migrate-cli; \
  mkdir -p "${MIGRATE_DIR}/node_modules/@prisma"; \
  PRISMA_ROOT="$(find node_modules/.pnpm -type d -path '*/node_modules/prisma' | head -1)"; \
  cp -r "${PRISMA_ROOT}" "${MIGRATE_DIR}/node_modules/prisma"; \
  for pkg in engines config; do \
    SRC="$(find node_modules/.pnpm -type d -path "*/node_modules/@prisma/${pkg}" | head -1)"; \
    if [ -n "${SRC}" ]; then cp -r "${SRC}" "${MIGRATE_DIR}/node_modules/@prisma/${pkg}"; fi; \
  done

# Shared runtime (Node app + prod dependencies from pnpm deploy)
FROM node:24-alpine AS runtime-base
WORKDIR /app
COPY --from=builder /app/package.json /tmp/root-package.json
RUN node -e "const fs=require('fs');const v=JSON.parse(fs.readFileSync('/tmp/root-package.json','utf8')).version;if(!v||!/^\d+\.\d+\.\d+$/.test(v)){console.error('ERROR: invalid root package.json version');process.exit(1);}fs.writeFileSync('/APP_VERSION',v);"
COPY content/releases ./content/releases
COPY --from=builder /app/deploy/ ./

# One-shot migrations (Prisma CLI bundle from builder – musl engines only)
FROM node:24-alpine AS migrate
WORKDIR /app
COPY --from=builder /app/migrate-cli/node_modules ./node_modules
COPY --from=builder /app/apps/backend/prisma ./prisma
COPY --from=builder /app/apps/backend/prisma.config.ts ./
COPY docker/entrypoint-migrate-prod.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV NODE_ENV=production
ENTRYPOINT ["/entrypoint.sh"]

# API container (no Prisma CLI, no pandoc)
FROM runtime-base AS app
RUN apk add --no-cache wget
COPY docker/entrypoint-api-prod.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]

# Job worker: PDF export (pandoc + typst – deutlich kleiner als TeX)
FROM runtime-base AS worker
ARG TYPST_VERSION=0.13.1
COPY docker/install-typst-alpine.sh /tmp/install-typst-alpine.sh
RUN apk add --no-cache pandoc postgresql-client zstd tar wget xz \
  && TYPST_VERSION="${TYPST_VERSION}" sh /tmp/install-typst-alpine.sh \
  && rm /tmp/install-typst-alpine.sh
ENV NODE_ENV=production
ENV PANDOC_ARGS=--pdf-engine=typst
COPY docker/entrypoint-worker-prod.sh /entrypoint-worker.sh
RUN chmod +x /entrypoint-worker.sh
ENTRYPOINT ["/entrypoint-worker.sh"]
