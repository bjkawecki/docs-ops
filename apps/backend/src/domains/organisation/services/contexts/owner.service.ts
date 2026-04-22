import type { PrismaClient } from '../../../../../generated/prisma/client.js';
import { setOwnerDisplayName } from '../contextOwnerDisplay.js';

type OwnerScopeOptions = {
  companyId?: string;
  departmentId?: string;
  teamId?: string;
  ownerUserId?: string;
};

async function findOrCreateOwner(
  prisma: PrismaClient,
  opts: OwnerScopeOptions
): Promise<{ id: string }> {
  if (opts.companyId) {
    let owner = await prisma.owner.findFirst({
      where: { companyId: opts.companyId, departmentId: null, teamId: null, ownerUserId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({
        data: { companyId: opts.companyId },
      });
      await setOwnerDisplayName(prisma, owner.id);
    }
    return { id: owner.id };
  }
  if (opts.departmentId) {
    let owner = await prisma.owner.findFirst({
      where: { departmentId: opts.departmentId, companyId: null, teamId: null, ownerUserId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({
        data: { departmentId: opts.departmentId },
      });
      await setOwnerDisplayName(prisma, owner.id);
    }
    return { id: owner.id };
  }
  if (opts.teamId) {
    let owner = await prisma.owner.findFirst({
      where: { teamId: opts.teamId, companyId: null, departmentId: null, ownerUserId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({
        data: { teamId: opts.teamId },
      });
      await setOwnerDisplayName(prisma, owner.id);
    }
    return { id: owner.id };
  }
  if (opts.ownerUserId) {
    let owner = await prisma.owner.findFirst({
      where: { ownerUserId: opts.ownerUserId, companyId: null, departmentId: null, teamId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({
        data: { ownerUserId: opts.ownerUserId },
      });
      await setOwnerDisplayName(prisma, owner.id);
    }
    return { id: owner.id };
  }
  throw new Error('One of companyId, departmentId, teamId or ownerUserId is required');
}

export { findOrCreateOwner };
export type { OwnerScopeOptions };
