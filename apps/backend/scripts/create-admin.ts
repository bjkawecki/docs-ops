/**
 * Legt einen Admin-Nutzer an, falls noch keiner existiert.
 * Pflicht: ADMIN_EMAIL, ADMIN_PASSWORD sowie ein Anzeigename über ADMIN_NAME
 * oder ADMIN_VORNAME + ADMIN_NACHNAME (dann Anzeigename = "Vorname Nachname").
 * DATABASE_URL wird wie im Rest der App verwendet (z. B. aus .env).
 */
import { assertRequiredEnv } from './load-env.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/domains/auth/services/password.js';

const maxDbAttempts = Math.max(1, Number(process.env.CREATE_ADMIN_DB_ATTEMPTS ?? 30));
const dbRetryDelayMs = Math.max(200, Number(process.env.CREATE_ADMIN_DB_DELAY_MS ?? 1000));

function isTransientConnectionError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const o = e as { code?: string; errorCode?: string; cause?: unknown };
  const code = o.code ?? o.errorCode;
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'P1001') return true;
  if (o.cause !== undefined) return isTransientConnectionError(o.cause);
  return false;
}

async function main() {
  assertRequiredEnv(['ADMIN_EMAIL', 'ADMIN_PASSWORD']);

  const email = process.env.ADMIN_EMAIL!.trim();
  const password = process.env.ADMIN_PASSWORD!;
  const vorname = process.env.ADMIN_VORNAME?.trim();
  const nachname = process.env.ADMIN_NACHNAME?.trim();
  const nameExplicit = process.env.ADMIN_NAME?.trim();
  const name =
    (vorname && nachname ? `${vorname} ${nachname}`.trim() : null) ||
    nameExplicit ||
    email ||
    'Admin';

  const existingAdmin = await prisma.user.findFirst({ where: { isAdmin: true } });
  if (existingAdmin) {
    console.log('Es existiert bereits ein Admin:', existingAdmin.email ?? existingAdmin.id);
    return;
  }

  const passwordHash = await hashPassword(password);
  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    await prisma.user.update({
      where: { id: existingByEmail.id },
      data: { name, passwordHash, isAdmin: true },
    });
    console.log('Bestehenden Nutzer zum Admin gemacht:', email);
    return;
  }

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

async function mainWithDbRetries(): Promise<void> {
  let last: unknown;
  for (let i = 1; i <= maxDbAttempts; i++) {
    try {
      await main();
      return;
    } catch (e) {
      last = e;
      if (!isTransientConnectionError(e) || i === maxDbAttempts) {
        throw e;
      }
      if (i === 1 || i % 5 === 0) {
        console.warn(
          `create-admin: Datenbank kurz nicht erreichbar, erneuter Versuch (${i}/${maxDbAttempts}) …`
        );
      }
      await new Promise((r) => setTimeout(r, dbRetryDelayMs));
    }
  }
  throw last;
}

mainWithDbRetries()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    const err = e as { code?: string; message?: string; errorCode?: string };
    const code = err?.code ?? err?.errorCode;
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'P1001') {
      console.error(
        'Fehler: Keine Verbindung zur Datenbank. Ist Postgres gestartet? (z. B. make infra oder docker compose up -d postgres). DATABASE_URL prüfen.'
      );
    } else if (err?.code === 'P2021') {
      console.error(
        'Fehler: Tabelle "User" existiert nicht. Zuerst Migrationen ausführen: make migrate'
      );
    } else if (err?.code === 'P2002') {
      console.warn(
        'User mit dieser E-Mail existiert bereits (Unique-Constraint). Überspringe Admin-Anlage.'
      );
      process.exit(0);
    } else {
      console.error(e);
    }
    process.exit(1);
  });
