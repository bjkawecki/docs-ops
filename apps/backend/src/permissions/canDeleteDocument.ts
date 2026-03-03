import type { PrismaClient } from '../../generated/prisma/client.js';
import { canWriteContext } from './contextPermissions.js';

/**
 * Checks if the user may delete the document (see Rechtesystem).
 * Only scope lead (and admin, owner of personal process/project via ownerUserId) – explicit writer grant does not suffice.
 * Implementation: same check as for context (canWriteContext).
 */
export async function canDeleteDocument(
  prisma: PrismaClient,
  userId: string,
  documentId: string
): Promise<boolean> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { contextId: true },
  });
  if (!doc) return false;
  return canWriteContext(prisma, userId, doc.contextId);
}
