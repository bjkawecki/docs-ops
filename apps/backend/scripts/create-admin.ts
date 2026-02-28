/**
 * Legt einen Admin-Nutzer an, falls noch keiner existiert.
 * Liest ADMIN_EMAIL, ADMIN_PASSWORD und optional ADMIN_NAME aus der Umgebung.
 * DATABASE_URL wird wie im Rest der App verwendet (z. B. aus .env).
 */
import { assertRequiredEnv } from './load-env.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

async function main() {
  assertRequiredEnv(['ADMIN_EMAIL', 'ADMIN_PASSWORD']);

  const email = process.env.ADMIN_EMAIL!.trim();
  const password = process.env.ADMIN_PASSWORD!;
  const name = process.env.ADMIN_NAME?.trim() ?? 'Admin';

  const existing = await prisma.user.findFirst({ where: { isAdmin: true } });
  if (existing) {
    console.log('Es existiert bereits ein Admin:', existing.email ?? existing.id);
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      isAdmin: true,
    },
  });

  console.log('Admin angelegt:', user.email);
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'ECONNREFUSED') {
      console.error(
        'Fehler: Keine Verbindung zur Datenbank. Ist Postgres gestartet? (z. B. make docker-dev oder docker compose up -d postgres). DATABASE_URL prüfen.'
      );
    } else if (err?.code === 'P2021') {
      console.error(
        'Fehler: Tabelle "User" existiert nicht. Zuerst Migrationen ausführen: make migrate'
      );
    } else {
      console.error(e);
    }
    process.exit(1);
  });
