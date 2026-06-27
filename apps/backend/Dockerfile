# Erwartet Build-Kontext: Repo-Root (docker build -f apps/backend/Dockerfile .)
# Targets: migrate (Prisma deploy) | app (API) | worker (PDF export via typst)
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
  mkdir -p "${MIGRATE_DIR}"; \
  PRISMA_VER="$(node -pe "JSON.parse(require('fs').readFileSync('apps/backend/package.json','utf8')).devDependencies.prisma.replace(/^\\^/,'')")"; \
  printf '{"private":true,"dependencies":{"prisma":"%s"}}' "${PRISMA_VER}" > "${MIGRATE_DIR}/package.json"; \
  cd "${MIGRATE_DIR}" && npm install --omit=dev --no-package-lock --no-audit --no-fund

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

# API container (no Prisma CLI, no typst)
FROM runtime-base AS app
RUN apk add --no-cache wget
COPY docker/entrypoint-api-prod.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]

# Job worker: PDF export (typst) + backup tools
FROM runtime-base AS worker
ARG TYPST_VERSION=0.13.1
COPY docker/install-typst-alpine.sh /tmp/install-typst-alpine.sh
RUN apk add --no-cache postgresql-client zstd tar wget xz \
  && TYPST_VERSION="${TYPST_VERSION}" sh /tmp/install-typst-alpine.sh \
  && rm /tmp/install-typst-alpine.sh
ENV NODE_ENV=production
COPY docker/entrypoint-worker-prod.sh /entrypoint-worker.sh
RUN chmod +x /entrypoint-worker.sh
ENTRYPOINT ["/entrypoint-worker.sh"]
