# Erwartet Build-Kontext: Repo-Root (docker build -f apps/backend/Dockerfile .)
# Build
FROM node:24-alpine AS builder
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
COPY apps ./apps
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter backend run build

# Run
FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/package.json ./
RUN npm install --omit=dev
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
