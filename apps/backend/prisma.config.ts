import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
try {
  require('dotenv/config');
} catch {
  /* dotenv optional (e.g. Docker build) */
}
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/docsops',
  },
});
