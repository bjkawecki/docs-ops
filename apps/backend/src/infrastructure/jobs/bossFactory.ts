import { PgBoss } from 'pg-boss';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/docsops';

export function createBoss(): PgBoss {
  return new PgBoss(connectionString);
}
