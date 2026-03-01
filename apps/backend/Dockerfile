# Erwartet Build-Kontext: Repo-Root (docker build -f apps/backend/Dockerfile .)
# Build
FROM node:24-alpine AS builder
RUN corepack enable pnpm
WORKDIR /app
# Hoisted node_modules so binaries (prisma, tsc) are in PATH when running from any package
RUN echo "node-linker=hoisted" > .npmrc
COPY package.json pnpm-lock.yaml* ./
COPY apps ./apps
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter backend exec prisma generate --schema=prisma/schema.prisma && \
    pnpm exec tsc -p apps/backend/tsconfig.json

# Run
FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/package.json ./
COPY --from=builder /app/apps/backend/prisma ./prisma
RUN npm install --omit=dev
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/index.js"]
