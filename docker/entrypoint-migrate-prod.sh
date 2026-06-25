#!/bin/sh
set -e

exec node ./node_modules/prisma/build/index.js migrate deploy
