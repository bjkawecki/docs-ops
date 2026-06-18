#!/bin/sh
set -e

npx prisma migrate deploy

if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  node dist/scripts/create-admin.js || true
fi

exec node dist/src/entrypoints/api.js
