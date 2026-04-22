import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { canWriteContext } from '../../organisation/permissions/contextPermissions.js';

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
  // Publish only allowed when document has a context (context-free drafts must assign context first)
  if (doc.contextId == null) return false;
  return canWriteContext(prisma, userId, doc.contextId);
}
