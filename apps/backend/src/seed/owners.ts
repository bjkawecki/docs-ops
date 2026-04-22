import type { PrismaClient } from '../../generated/prisma/client.js';
import { setOwnerDisplayName } from '../domains/organisation/services/contextOwnerDisplay.js';
import type { SeedMasterData, SeedOwnerData } from './types.js';

async function seedOwners(prisma: PrismaClient, data: SeedMasterData): Promise<SeedOwnerData> {
  const ownerByCompany = new Map<string, string>();
  const ownerByDepartment = new Map<string, string>();
  const ownerByTeam = new Map<string, string>();
  const ownerByUser = new Map<string, string>();

  for (const row of data.companies) {
    const companyId = data.companyById.get(row.name);
    if (!companyId) continue;
    let owner = await prisma.owner.findFirst({
      where: { companyId, departmentId: null, teamId: null, ownerUserId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({ data: { companyId } });
      await setOwnerDisplayName(prisma, owner.id);
    }
    ownerByCompany.set(row.name, owner.id);
  }

  for (const row of data.departments) {
    const departmentId = data.departmentById.get(row.name);
    if (!departmentId) continue;
    let owner = await prisma.owner.findFirst({
      where: { departmentId, companyId: null, teamId: null, ownerUserId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({ data: { departmentId } });
      await setOwnerDisplayName(prisma, owner.id);
    }
    ownerByDepartment.set(row.name, owner.id);
  }

  for (const row of data.teams) {
    const teamId = data.teamById.get(row.name);
    if (!teamId) continue;
    let owner = await prisma.owner.findFirst({
      where: { teamId, companyId: null, departmentId: null, ownerUserId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({ data: { teamId } });
      await setOwnerDisplayName(prisma, owner.id);
    }
    ownerByTeam.set(row.name, owner.id);
  }

  if (data.firstUserEmail) {
    const userId = data.userById.get(data.firstUserEmail);
    if (userId) {
      let owner = await prisma.owner.findFirst({
        where: { ownerUserId: userId, companyId: null, departmentId: null, teamId: null },
      });
      if (!owner) {
        owner = await prisma.owner.create({ data: { ownerUserId: userId } });
        await setOwnerDisplayName(prisma, owner.id);
      }
      ownerByUser.set(data.firstUserEmail, owner.id);
    }
  }

  return {
    ownerByCompany,
    ownerByDepartment,
    ownerByTeam,
    ownerByUser,
    companyName: data.companies[0]?.name ?? 'Seed Company',
    firstTeamName: data.teams[0]?.name,
  };
}

export { seedOwners };
