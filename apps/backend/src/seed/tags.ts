import type { PrismaClient } from '../../generated/prisma/client.js';
import type { SeedMasterData, SeedOwnerData } from './types.js';

async function seedTags(
  prisma: PrismaClient,
  masterData: SeedMasterData,
  ownerData: SeedOwnerData
): Promise<Map<string, string>> {
  const tagByNameAndOwner = new Map<string, string>();

  const companyOwnerId = ownerData.ownerByCompany.get(ownerData.companyName);
  if (companyOwnerId) {
    for (const name of ['Referenz', 'Wichtig', 'Draft']) {
      const tag = await prisma.tag.create({ data: { name, ownerId: companyOwnerId } });
      tagByNameAndOwner.set(`${companyOwnerId}:${name}`, tag.id);
    }
  }

  if (ownerData.firstTeamName) {
    const teamOwnerId = ownerData.ownerByTeam.get(ownerData.firstTeamName);
    if (teamOwnerId) {
      for (const name of ['Sprint', 'Bugfix']) {
        const tag = await prisma.tag.create({ data: { name, ownerId: teamOwnerId } });
        tagByNameAndOwner.set(`${teamOwnerId}:${name}`, tag.id);
      }
    }
  }

  if (masterData.firstUserEmail && ownerData.ownerByUser.has(masterData.firstUserEmail)) {
    const personalOwnerId = ownerData.ownerByUser.get(masterData.firstUserEmail)!;
    for (const name of ['Privat', 'Ideen']) {
      const tag = await prisma.tag.create({ data: { name, ownerId: personalOwnerId } });
      tagByNameAndOwner.set(`${personalOwnerId}:${name}`, tag.id);
    }
  }

  return tagByNameAndOwner;
}

export { seedTags };
