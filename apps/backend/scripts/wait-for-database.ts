/**
 * Wartet, bis Postgres unter DATABASE_URL antwortet (Docker: Race nach `service_healthy`).
 * Nutzung: `pnpm --filter backend exec tsx scripts/wait-for-database.ts`
 */
import pg from 'pg';

const url = process.env.DATABASE_URL?.trim() ?? '';
if (url === '') {
  console.error('wait-for-database: DATABASE_URL ist leer.');
  process.exit(1);
}

const maxAttempts = Math.max(1, Number(process.env.WAIT_FOR_DB_ATTEMPTS ?? 60));
const delayMs = Math.max(200, Number(process.env.WAIT_FOR_DB_DELAY_MS ?? 1000));

async function main(): Promise<void> {
  for (let i = 1; i <= maxAttempts; i++) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      console.log(`wait-for-database: verbunden (Versuch ${i}/${maxAttempts}).`);
      return;
    } catch (e) {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (i === 1 || i % 10 === 0) {
        console.warn(
          `wait-for-database: Versuch ${i}/${maxAttempts} … (${code || 'connect failed'})`
        );
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error('wait-for-database: Timeout — Postgres nicht erreichbar. DATABASE_URL prüfen.');
  process.exit(1);
}

void main();
