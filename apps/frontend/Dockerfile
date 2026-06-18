# Production frontend: static Vite build behind nginx.
# Build context: repo root (docker build -f apps/frontend/Dockerfile .)
FROM node:24-alpine AS builder
RUN corepack enable pnpm
WORKDIR /app
RUN echo "node-linker=hoisted" > .npmrc
COPY package.json pnpm-lock.yaml* ./
COPY apps ./apps
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter frontend run build

FROM nginx:alpine
RUN apk add --no-cache wget
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
