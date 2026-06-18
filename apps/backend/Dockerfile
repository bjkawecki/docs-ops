# Erwartet Build-Kontext: Repo-Root (docker build -f apps/backend/Dockerfile .)
# Targets: app (API, schlank) | worker (PDF-Export via pandoc/typst)
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

# Shared runtime (Node app + prod dependencies)
FROM node:24-alpine AS runtime-base
WORKDIR /app
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/generated ./generated
COPY --from=builder /app/apps/backend/prisma ./prisma
COPY --from=builder /app/apps/backend/prisma.config.ts ./
COPY --from=builder /app/apps/backend/package.json ./package.json
# prepare script calls pnpm (not in runtime image) → strip lifecycle hooks before npm install
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));if(p.scripts){delete p.scripts.prepare;delete p.scripts.preinstall;delete p.scripts.postinstall;}fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');" \
  && npm install --omit=dev --ignore-scripts

# API container: migrations + health probes only (no pandoc)
FROM runtime-base AS app
RUN apk add --no-cache postgresql-client wget
COPY docker/entrypoint-api-prod.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]

# Job worker: PDF export (pandoc + typst — deutlich kleiner als TeX)
FROM runtime-base AS worker
RUN apk add --no-cache pandoc typst postgresql-client zstd tar wget
ENV NODE_ENV=production
ENV PANDOC_ARGS=--pdf-engine=typst
ENTRYPOINT ["node", "dist/src/entrypoints/worker.js"]
