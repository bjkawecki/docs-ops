import type { PrismaClient } from '../../generated/prisma/client.js';
import { canWriteContext } from './contextPermissions.js';

/**
 * Checks if the user may publish the document (set publishedAt, create first version).
 * Only scope lead (and admin, owner of personal context) – same as canWriteContext on the document's context.
 */
export async function canPublishDocument(
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
