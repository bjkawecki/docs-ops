import { buildApp } from '../app.js';
import { prisma } from '../infrastructure/db/prisma.js';
import { runSeedIfNeeded } from '../seed.js';
import { ensureDefaultBackupDestinationFromEnv } from '../domains/admin/services/adminBackupDestinationBootstrap.js';

const app = await buildApp();
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST ?? '0.0.0.0';

try {
  await runSeedIfNeeded(prisma);
} catch (err) {
  app.log.error(
    { err },
    'runSeedIfNeeded fehlgeschlagen – Server startet trotzdem (Migration/DB prüfen)'
  );
}

try {
  await ensureDefaultBackupDestinationFromEnv(prisma, app.log);
} catch (err) {
  app.log.error(
    { err },
    'ensureDefaultBackupDestinationFromEnv fehlgeschlagen – Server startet trotzdem'
  );
}

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
