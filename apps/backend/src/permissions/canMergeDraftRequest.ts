import type { PrismaClient } from '../../generated/prisma/client.js';
import { canWriteContext } from './contextPermissions.js';

/**
 * Checks if the user may merge or reject a draft request (PR).
 * Only scope lead of the document's context (and admin, owner of personal context).
 */
export async function canMergeDraftRequest(
  prisma: PrismaClient,
  userId: string,
  draftRequestId: string
): Promise<boolean> {
  const draftRequest = await prisma.draftRequest.findUnique({
    where: { id: draftRequestId },
    select: { document: { select: { contextId: true } } },
  });
  if (!draftRequest?.document) return false;
  return canWriteContext(prisma, userId, draftRequest.document.contextId);
}
