import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client.js';

/**
 * Konfiguration für den Pg-Adapter (kein eigenes `pg.Pool`-Objekt übergeben).
 * Sonst kann `pool instanceof require('pg').Pool` im CJS-Adapter false sein (ESM/CJS-Doppel-Ladung),
 * der Adapter würde den Pool fälschlich als Options-Objekt behandeln → z. B. dauerhaft ECONNREFUSED.
 */
function pgPoolConfigFromEnv(): {
  connectionString: string;
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
} {
  const raw = process.env.DATABASE_URL?.trim();
  const connectionString =
    raw && raw.length > 0 ? raw : 'postgresql://app:app@localhost:5432/docsops';
  return {
    connectionString,
    max: 15,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 60_000,
  };
}

const adapter = new PrismaPg(pgPoolConfigFromEnv(), {
  onPoolError: (err) => {
    console.error('[pg pool] Unerwarteter Fehler auf Leerlauf-Client:', err);
  },
});

export const prisma = new PrismaClient({ adapter });
