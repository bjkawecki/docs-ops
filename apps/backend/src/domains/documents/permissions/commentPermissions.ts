import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { loadUser } from './canRead.js';
import { canWrite } from './canWrite.js';
import { canWriteContext } from '../../organisation/permissions/contextPermissions.js';
import type { DocumentForPermission } from './documentLoad.js';

/**
 * Moderation: fremde Kommentare löschen (vgl. Rechtesystem §6c).
 * Mit Kontext: Scope-Lead / Personal-Owner via canWriteContext; ohne Kontext: canWrite auf dem Dokument.
 */
export async function canModerateDocumentComments(
  prisma: PrismaClient,
  userId: string,
  doc: DocumentForPermission
): Promise<boolean> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;
  if (user.isAdmin) return true;
  if (doc.contextId != null) {
    return canWriteContext(prisma, userId, doc.contextId);
  }
  return canWrite(prisma, userId, doc);
}
