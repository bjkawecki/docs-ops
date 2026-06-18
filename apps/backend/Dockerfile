# Erwartet Build-Kontext: Repo-Root (docker build -f apps/backend/Dockerfile .)
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

# Run
FROM node:24-alpine
RUN apk add --no-cache pandoc texlive texlive-latexextra texmf-dist-fontsrecommended postgresql-client zstd tar wget
WORKDIR /app
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/generated ./generated
COPY --from=builder /app/apps/backend/prisma ./prisma
COPY --from=builder /app/apps/backend/prisma.config.ts ./
COPY --from=builder /app/apps/backend/package.json ./package.json
COPY docker/entrypoint-api-prod.sh /entrypoint.sh
# prepare script calls pnpm (not in runtime image) → strip lifecycle hooks before npm install
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));if(p.scripts){delete p.scripts.prepare;delete p.scripts.preinstall;delete p.scripts.postinstall;}fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');" \
  && npm install --omit=dev --ignore-scripts \
  && chmod +x /entrypoint.sh
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
