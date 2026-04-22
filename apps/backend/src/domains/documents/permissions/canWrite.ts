import type { Prisma, PrismaClient } from '../../../../generated/prisma/client.js';
import { GrantRole } from '../../../../generated/prisma/client.js';
import type { DocumentForPermission } from './documentLoad.js';
import {
  getDocumentOwner,
  getUserDepartmentIds,
  getUserLeaderTeamIds,
  hasDocumentGrantRole,
  isCompanyLeadForOwner,
  loadUser,
  loadDocument,
} from './canRead.js';

/**
 * Prüft, ob der Nutzer das Dokument schreiben darf (vgl. Rechtesystem).
 * @param documentOrId - documentId (string) oder bereits geladenes Document mit Context/Grants
 */
export async function canWrite(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
  documentOrId: string | DocumentForPermission
): Promise<boolean> {
  // Bei ID zuerst Dokument laden: nicht vorhanden → false (auch für Admin)
  const doc =
    typeof documentOrId === 'string' ? await loadDocument(prisma, documentOrId) : documentOrId;
  if (!doc) return false;

  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

  // 1. isAdmin
  if (user.isAdmin) return true;

  // 2. Context-free document (contextId null): only creator and explicit grants
  if (doc.contextId == null || doc.context == null) {
    if (doc.createdById === userId) return true;
    return hasDocumentGrantRole(
      doc,
      userId,
      GrantRole.Write,
      getUserLeaderTeamIds(user),
      getUserDepartmentIds(user)
    );
  }

  // 3. Owner of personal context (process/project with ownerUserId)
  const owner = getDocumentOwner(doc);
  if (owner?.ownerUserId === userId) return true;

  // 4. Company Lead (contexts with company owner)
  if (isCompanyLeadForOwner(user, owner)) return true;

  // 5. Explicit grants
  if (
    hasDocumentGrantRole(
      doc,
      userId,
      GrantRole.Write,
      getUserLeaderTeamIds(user),
      getUserDepartmentIds(user)
    )
  ) {
    return true;
  }

  return false;
}
