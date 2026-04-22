/**
 * Seed script: loads dummy data from CSV files if the database has no company yet.
 * Called on app startup or can be run standalone via pnpm run seed.
 */
import type { PrismaClient } from '../generated/prisma/client.js';
import { loadSeedCsvData } from './seed/csv.js';
import { seedMasterData } from './seed/master-data.js';
import { seedOwners } from './seed/owners.js';
import { seedContexts } from './seed/contexts.js';
import { seedTags } from './seed/tags.js';
import { seedDocuments } from './seed/documents.js';

export async function runSeedIfNeeded(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.company.count();
  if (existing > 0) return;

  const csv = loadSeedCsvData();
  if (csv.companies.length === 0) return;

  const masterData = await seedMasterData(prisma, csv);
  const ownerData = await seedOwners(prisma, masterData);
  const contextData = await seedContexts(prisma, masterData, ownerData);
  const tagByNameAndOwner = await seedTags(prisma, masterData, ownerData);
  await seedDocuments(prisma, contextData, tagByNameAndOwner);
}
