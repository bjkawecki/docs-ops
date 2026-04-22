import type { Prisma, PrismaClient } from '../../../../generated/prisma/client.js';
import { GrantRole } from '../../../../generated/prisma/client.js';
import type { DocumentForPermission } from './documentLoad.js';
import { loadUser, loadDocument } from './canRead.js';

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
    const userLeaderTeamIds = new Set(user.leadOfTeams.map((l) => l.teamId));
    const userDepartmentIds = new Set([
      ...user.teamMemberships.map((m) => m.team.departmentId),
      ...user.leadOfTeams.map((l) => l.team.departmentId),
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

  // 3. Owner of personal context (process/project with ownerUserId)
  const owner =
    doc.context.process?.owner ??
    doc.context.project?.owner ??
    doc.context.subcontext?.project?.owner ??
    null;
  if (owner?.ownerUserId === userId) return true;

  // 4. Company Lead (contexts with company owner)
  const companyId = owner?.companyId ?? null;
  if (companyId !== null) {
    const isCompanyLead = user.companyLeads.some((c) => c.companyId === companyId);
    if (isCompanyLead) return true;
  }

  // 5. Explicit grants
  const userLeaderTeamIds = new Set(user.leadOfTeams.map((l) => l.teamId));
  const userDepartmentIds = new Set([
    ...user.teamMemberships.map((m) => m.team.departmentId),
    ...user.leadOfTeams.map((l) => l.team.departmentId),
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
