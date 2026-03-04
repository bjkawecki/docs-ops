import type { PrismaClient } from '../../generated/prisma/client.js';
import { GrantRole } from '../../generated/prisma/client.js';
import { DOCUMENT_FOR_PERMISSION_INCLUDE, type DocumentForPermission } from './documentLoad.js';

/** User mit Relationen für Rechteprüfung (canRead/canWrite). */
type UserForPermission = {
  id: string;
  isAdmin: boolean;
  deletedAt: Date | null;
  teamMemberships: { team: { id: string; departmentId: string } }[];
  leadOfTeams: { teamId: string; team: { departmentId: string } }[];
  departmentLeads: { departmentId: string }[];
  companyLeads: { companyId: string }[];
};

/** Für canRead/canWrite: User mit Relationen laden. Export für canWrite. */
export async function loadUser(
  prisma: PrismaClient,
  userId: string
): Promise<UserForPermission | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isAdmin: true,
      deletedAt: true,
      teamMemberships: { include: { team: { select: { id: true, departmentId: true } } } },
      leadOfTeams: {
        include: { team: { select: { departmentId: true } } },
      },
      departmentLeads: { select: { departmentId: true } },
      companyLeads: { select: { companyId: true } },
    },
  });
  return user as UserForPermission | null;
}

/** Lädt Document per ID (exportiert für canWrite). */
export async function loadDocument(
  prisma: PrismaClient,
  documentId: string
): Promise<DocumentForPermission | null> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: DOCUMENT_FOR_PERMISSION_INCLUDE,
  });
  return doc as DocumentForPermission | null;
}

/** Ermittelt die Company-Owner-ID des Dokument-Kontexts (Process/Project/Subcontext), falls Owner eine Company ist. */
function getContextOwnerCompanyId(doc: DocumentForPermission): string | null {
  const ctx = doc.context;
  const owner = ctx.process?.owner ?? ctx.project?.owner ?? ctx.subcontext?.project?.owner ?? null;
  return owner?.companyId ?? null;
}

/** Returns the department id of the document context owner (Process/Project/Subcontext). */
function getContextOwnerDepartmentId(doc: DocumentForPermission): string | null {
  const ctx = doc.context;
  if (ctx.process?.owner) {
    const o = ctx.process.owner;
    if (o.departmentId) return o.departmentId;
    if (o.team?.departmentId) return o.team.departmentId;
    return null;
  }
  if (ctx.project?.owner) {
    const o = ctx.project.owner;
    if (o.departmentId) return o.departmentId;
    if (o.team?.departmentId) return o.team.departmentId;
    return null;
  }
  if (ctx.subcontext?.project?.owner) {
    const o = ctx.subcontext.project.owner;
    if (o.departmentId) return o.departmentId;
    if (o.team?.departmentId) return o.team.departmentId;
    return null;
  }
  return null;
}

/**
 * Prüft, ob der Nutzer das Dokument lesen darf (vgl. Rechtesystem).
 * @param documentOrId - documentId (string) oder bereits geladenes Document mit Context/Grants
 */
export async function canRead(
  prisma: PrismaClient,
  userId: string,
  documentOrId: string | DocumentForPermission
): Promise<boolean> {
  // Bei ID zuerst Dokument laden: nicht vorhanden → false (auch für Admin)
  const doc: DocumentForPermission | null =
    typeof documentOrId === 'string' ? await loadDocument(prisma, documentOrId) : documentOrId;
  if (!doc) return false;

  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

  // 1. isAdmin
  if (user.isAdmin) return true;

  // 2. Owner of personal context (process/project with ownerUserId)
  const owner =
    doc.context.process?.owner ??
    doc.context.project?.owner ??
    doc.context.subcontext?.project?.owner ??
    null;
  if (owner?.ownerUserId === userId) return true;

  // 3. Company Lead (contexts with company owner)
  const ownerCompanyId = getContextOwnerCompanyId(doc);
  if (ownerCompanyId !== null) {
    const isCompanyLead = user.companyLeads.some((c) => c.companyId === ownerCompanyId);
    if (isCompanyLead) return true;
  }

  // 4. Department Lead (contexts with department/team owner)
  const ownerDeptId = getContextOwnerDepartmentId(doc);
  if (ownerDeptId !== null) {
    const isDeptLead = user.departmentLeads.some((d) => d.departmentId === ownerDeptId);
    if (isDeptLead) return true;
  }

  // 5. Explicit grants (Team Lead sieht Team-Grants wie Mitglieder)
  const userTeamIds = new Set([
    ...user.teamMemberships.map((m) => m.team.id),
    ...user.leadOfTeams.map((l) => l.teamId),
  ]);
  const userDepartmentIds = new Set([
    ...user.teamMemberships.map((m) => m.team.departmentId),
    ...user.leadOfTeams.map((l) => l.team.departmentId),
  ]);

  if (doc.grantUser.some((g) => g.userId === userId && g.role === GrantRole.Read)) return true;
  if (doc.grantTeam.some((g) => g.role === GrantRole.Read && userTeamIds.has(g.teamId)))
    return true;
  if (
    doc.grantDepartment.some(
      (g) => g.role === GrantRole.Read && userDepartmentIds.has(g.departmentId)
    )
  )
    return true;

  return false;
}
