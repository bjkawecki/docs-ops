/**
 * Standalone seed runner. Loads .env then runs runSeedIfNeeded.
 * Usage: pnpm run seed (from apps/backend).
 */
import './load-env.js';
import { prisma } from '../src/db.js';
import { runSeedIfNeeded } from '../src/seed.js';

void runSeedIfNeeded(prisma)
  .then(() => {
    console.log('Seed finished (data created only if no company existed).');
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
