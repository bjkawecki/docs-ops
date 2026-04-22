import type { Prisma, PrismaClient } from '../../../../generated/prisma/client.js';
import { GrantRole } from '../../../../generated/prisma/client.js';
import type { DocumentForPermission } from './documentLoad.js';
import {
  evaluateBaseDocumentPermission,
  getDocumentOwner,
  getUserDepartmentIds,
  getUserLeaderTeamIds,
  hasDocumentGrantRole,
  isCompanyLeadForOwner,
  loadPermissionSubject,
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
  const subject = await loadPermissionSubject(prisma, userId, documentOrId);
  if (!subject) return false;
  const { doc, user } = subject;

  const baseDecision = evaluateBaseDocumentPermission(
    doc,
    user,
    userId,
    GrantRole.Write,
    getUserLeaderTeamIds(user)
  );
  if (baseDecision !== null) return baseDecision;

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
