import type { PrismaClient } from '../../generated/prisma/client.js';
import { canWriteContext } from './contextPermissions.js';
import { canWrite } from './canWrite.js';

/**
 * Checks if the user may delete the document (see Rechtesystem).
 * For documents with context: scope lead (and admin, owner of personal process/project).
 * For context-free documents: creator or explicit write grant (canWrite).
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
  if (doc.contextId == null) return canWrite(prisma, userId, documentId);
  return canWriteContext(prisma, userId, doc.contextId);
}
