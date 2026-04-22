import type { Prisma, PrismaClient } from '../../../../generated/prisma/client.js';
import { GrantRole } from '../../../../generated/prisma/client.js';
import type { DocumentForPermission } from './documentLoad.js';
import {
  getDocumentOwner,
  getUserDepartmentIds,
  getUserLeaderTeamIds,
  hasDocumentGrantRole,
  isCompanyLeadForOwner,
  isPersonalContextDocumentOwner,
  loadPermissionSubjectAndBaseDecision,
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
  const loaded = await loadPermissionSubjectAndBaseDecision(
    prisma,
    userId,
    documentOrId,
    GrantRole.Write,
    getUserLeaderTeamIds
  );
  if (!loaded) return false;
  const { doc, user } = loaded.subject;
  if (loaded.baseDecision !== null) return loaded.baseDecision;

  // 3. Owner of personal context (process/project with ownerUserId)
  const owner = getDocumentOwner(doc);
  if (isPersonalContextDocumentOwner(owner, userId)) return true;

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
