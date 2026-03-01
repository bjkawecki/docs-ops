/**
 * Legt einen Admin-Nutzer an, falls noch keiner existiert.
 * Pflicht: ADMIN_EMAIL, ADMIN_PASSWORD sowie ein Anzeigename über ADMIN_NAME
 * oder ADMIN_VORNAME + ADMIN_NACHNAME (dann Anzeigename = "Vorname Nachname").
 * DATABASE_URL wird wie im Rest der App verwendet (z. B. aus .env).
 */
import { assertRequiredEnv } from './load-env.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/auth/password.js';

async function main() {
  assertRequiredEnv(['ADMIN_EMAIL', 'ADMIN_PASSWORD']);

  const email = process.env.ADMIN_EMAIL!.trim();
  const password = process.env.ADMIN_PASSWORD!;
  const vorname = process.env.ADMIN_VORNAME?.trim();
  const nachname = process.env.ADMIN_NACHNAME?.trim();
  const nameExplicit = process.env.ADMIN_NAME?.trim();
  const name = vorname && nachname ? `${vorname} ${nachname}`.trim() : nameExplicit;
  if (!name) {
    console.error(
      'Fehler: Anzeigename fehlt. ADMIN_NAME setzen oder ADMIN_VORNAME und ADMIN_NACHNAME.'
    );
    process.exit(1);
  }

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
