import type { PrismaClient } from '../../generated/prisma/client.js';
import { canWriteContext } from './contextPermissions.js';

/**
 * Prüft, ob der Nutzer das Dokument löschen darf (vgl. Rechtesystem).
 * Nur Scope-Lead (und Admin, UserSpace-Owner) – expliziter Writer-Grant berechtigt nicht.
 * Implementierung: gleiche Prüfung wie für den Kontext (canWriteContext).
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
