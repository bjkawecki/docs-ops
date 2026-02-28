import type { PrismaClient } from '../../generated/prisma/client.js';
import { GrantRole } from '../../generated/prisma/client.js';
import { DOCUMENT_FOR_PERMISSION_INCLUDE, type DocumentForPermission } from './documentLoad.js';
import { loadUser } from './canRead.js';

/** Lädt Document per ID (für Aufruf mit documentId). */
async function loadDocument(
  prisma: PrismaClient,
  documentId: string
): Promise<DocumentForPermission | null> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: DOCUMENT_FOR_PERMISSION_INCLUDE,
  });
  return doc as DocumentForPermission | null;
}

/**
 * Prüft, ob der Nutzer das Dokument schreiben darf (vgl. Rechteableitung).
 * @param documentOrId - documentId (string) oder bereits geladenes Document mit Context/Grants
 */
export async function canWrite(
  prisma: PrismaClient,
  userId: string,
  documentOrId: string | DocumentForPermission
): Promise<boolean> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

  const doc =
    typeof documentOrId === 'string' ? await loadDocument(prisma, documentOrId) : documentOrId;
  if (!doc) return false;

  // 1. isAdmin
  if (user.isAdmin) return true;

  // 2. UserSpace-Owner
  if (doc.context.userSpace && doc.context.userSpace.ownerUserId === userId) {
    return true;
  }

  // 3. Explizite Grants
  const userLeaderTeamIds = new Set(user.leaderOfTeams.map((l) => l.teamId));
  const userDepartmentIds = new Set([
    ...user.teamMemberships.map((m) => m.team.departmentId),
    ...user.leaderOfTeams.map((l) => l.team.departmentId),
  ]);

  if (doc.grantUser.some((g) => g.userId === userId && g.role === GrantRole.Write)) return true;
  if (doc.grantTeam.some((g) => g.role === GrantRole.Write && userLeaderTeamIds.has(g.teamId)))
    return true;
  if (
    doc.grantDepartment.some(
      (g) => g.role === GrantRole.Write && userDepartmentIds.has(g.departmentId)
    )
  )
    return true;

  return false;
}
