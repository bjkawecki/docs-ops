import type { Prisma, PrismaClient } from '../../../../generated/prisma/client.js';
import { GrantRole } from '../../../../generated/prisma/client.js';
import {
  canViewCompany,
  canViewDepartment,
  canViewTeam,
} from '../../organisation/permissions/assignmentPermissions.js';
import { DOCUMENT_FOR_PERMISSION_INCLUDE, type DocumentForPermission } from './documentLoad.js';

/** User mit Relationen für Rechteprüfung (canRead/canWrite). */
export type UserForPermission = {
  id: string;
  isAdmin: boolean;
  deletedAt: Date | null;
  teamMemberships: {
    team: { id: string; departmentId: string; department: { companyId: string } };
  }[];
  leadOfTeams: {
    teamId: string;
    team: { departmentId: string; department: { companyId: string } };
  }[];
  departmentLeads: { departmentId: string; department: { companyId: string } }[];
  companyLeads: { companyId: string }[];
};

export function getDocumentOwner(doc: DocumentForPermission) {
  return (
    doc.context?.process?.owner ??
    doc.context?.project?.owner ??
    doc.context?.subcontext?.project?.owner ??
    null
  );
}

export function getUserReadableTeamIds(user: UserForPermission): Set<string> {
  return new Set([
    ...user.teamMemberships.map((m) => m.team.id),
    ...user.leadOfTeams.map((l) => l.teamId),
  ]);
}

export function getUserLeaderTeamIds(user: UserForPermission): Set<string> {
  return new Set(user.leadOfTeams.map((l) => l.teamId));
}

export function getUserDepartmentIds(user: UserForPermission): Set<string> {
  return new Set([
    ...user.teamMemberships.map((m) => m.team.departmentId),
    ...user.leadOfTeams.map((l) => l.team.departmentId),
  ]);
}

export function hasDocumentGrantRole(
  doc: DocumentForPermission,
  userId: string,
  role: GrantRole,
  teamIds: Set<string>,
  departmentIds: Set<string>
): boolean {
  if (doc.grantUser.some((g) => g.userId === userId && g.role === role)) return true;
  if (doc.grantTeam.some((g) => g.role === role && teamIds.has(g.teamId))) return true;
  if (doc.grantDepartment.some((g) => g.role === role && departmentIds.has(g.departmentId)))
    return true;
  return false;
}

export function evaluateBaseDocumentPermission(
  doc: DocumentForPermission,
  user: UserForPermission,
  userId: string,
  role: GrantRole,
  teamIds: Set<string>
): boolean | null {
  if (user.isAdmin) return true;
  if (doc.contextId == null || doc.context == null) {
    if (doc.createdById === userId) return true;
    return hasDocumentGrantRole(doc, userId, role, teamIds, getUserDepartmentIds(user));
  }
  return null;
}

export function isCompanyLeadForOwner(
  user: UserForPermission,
  owner: ReturnType<typeof getDocumentOwner>
): boolean {
  const companyId = owner?.companyId ?? null;
  return companyId != null && user.companyLeads.some((c) => c.companyId === companyId);
}

function getOwnerDepartmentId(owner: ReturnType<typeof getDocumentOwner>): string | null {
  if (!owner) return null;
  if (owner.departmentId) return owner.departmentId;
  return owner.team?.departmentId ?? null;
}

/** Für canRead/canWrite: User mit Relationen laden. Export für canWrite. */
export async function loadUser(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string
): Promise<UserForPermission | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isAdmin: true,
      deletedAt: true,
      teamMemberships: {
        include: {
          team: {
            select: { id: true, departmentId: true, department: { select: { companyId: true } } },
          },
        },
      },
      leadOfTeams: {
        include: {
          team: { select: { departmentId: true, department: { select: { companyId: true } } } },
        },
      },
      departmentLeads: {
        select: { departmentId: true, department: { select: { companyId: true } } },
      },
      companyLeads: { select: { companyId: true } },
    },
  });
  return user as UserForPermission | null;
}

/** Lädt Document per ID (exportiert für canWrite). */
export async function loadDocument(
  prisma: PrismaClient | Prisma.TransactionClient,
  documentId: string
): Promise<DocumentForPermission | null> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: DOCUMENT_FOR_PERMISSION_INCLUDE,
  });
  return doc as DocumentForPermission | null;
}

export async function loadPermissionSubject(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
  documentOrId: string | DocumentForPermission
): Promise<{ doc: DocumentForPermission; user: UserForPermission } | null> {
  const doc: DocumentForPermission | null =
    typeof documentOrId === 'string' ? await loadDocument(prisma, documentOrId) : documentOrId;
  if (!doc) return null;
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return null;
  return { doc, user };
}

/** Ermittelt die Company-Owner-ID des Dokument-Kontexts (Process/Project/Subcontext), falls Owner eine Company ist. */
function getContextOwnerCompanyId(doc: DocumentForPermission): string | null {
  return getDocumentOwner(doc)?.companyId ?? null;
}

/** Returns the department id of the document context owner (Process/Project/Subcontext). */
function getContextOwnerDepartmentId(doc: DocumentForPermission): string | null {
  return getOwnerDepartmentId(getDocumentOwner(doc));
}

/**
 * Prüft, ob der Nutzer das Dokument lesen darf (vgl. Rechtesystem).
 * @param documentOrId - documentId (string) oder bereits geladenes Document mit Context/Grants
 */
export async function canRead(
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
    GrantRole.Read,
    getUserReadableTeamIds(user)
  );
  if (baseDecision !== null) return baseDecision;

  // 3. Owner of personal context (process/project with ownerUserId)
  const owner = getDocumentOwner(doc);
  if (owner?.ownerUserId === userId) return true;

  // 4. Company Lead (contexts with company owner)
  const ownerCompanyId = getContextOwnerCompanyId(doc);
  if (ownerCompanyId !== null && isCompanyLeadForOwner(user, owner)) return true;

  // 5. Department Lead (contexts with department/team owner)
  const ownerDeptId = getContextOwnerDepartmentId(doc);
  if (ownerDeptId !== null) {
    const isDeptLead = user.departmentLeads.some((d) => d.departmentId === ownerDeptId);
    if (isDeptLead) return true;
  }

  // 6. Explicit grants (Team Lead sieht Team-Grants wie Mitglieder)
  if (
    hasDocumentGrantRole(
      doc,
      userId,
      GrantRole.Read,
      getUserReadableTeamIds(user),
      getUserDepartmentIds(user)
    )
  ) {
    return true;
  }

  // 7. Veröffentlichte Dokumente: Leserecht wie Kontext-Leserecht (analog canReadContext / Katalog).
  // Ohne diesen Schritt sehen Nutzer Einträge im Katalog, scheitern aber an GET /documents/:id.
  if (doc.publishedAt != null && userCanReadDocumentContext(doc, user)) return true;

  return false;
}

/**
 * Gleiche Organisations-/Team-Zugehörigkeit wie canReadContext, aber aus dem bereits geladenen
 * Document (ohne Prisma-Roundtrip, kein Zyklus zu contextPermissions).
 */
function userCanReadDocumentContext(doc: DocumentForPermission, user: UserForPermission): boolean {
  const owner = getDocumentOwner(doc);
  if (!owner) return false;

  const companyId = owner.companyId;
  const departmentId = owner.departmentId ?? owner.team?.departmentId ?? null;
  const teamId = owner.teamId;
  const ownerUserId = owner.ownerUserId;

  if (ownerUserId !== null && ownerUserId === user.id) return true;

  if (companyId) {
    if (user.companyLeads.some((c) => c.companyId === companyId)) return true;
    if (user.departmentLeads.some((d) => d.department.companyId === companyId)) return true;
    if (user.leadOfTeams.some((l) => l.team.department.companyId === companyId)) return true;
    if (user.teamMemberships.some((m) => m.team.department.companyId === companyId)) return true;
  }
  if (departmentId) {
    if (user.departmentLeads.some((d) => d.departmentId === departmentId)) return true;
    if (user.leadOfTeams.some((l) => l.team.departmentId === departmentId)) return true;
    if (user.teamMemberships.some((m) => m.team.departmentId === departmentId)) return true;
  }
  if (teamId) {
    if (user.teamMemberships.some((m) => m.team.id === teamId)) return true;
  }
  return false;
}

/**
 * Whether the user can see this document in trash (any scope: personal, company, department, team).
 * Used to allow opening trashed documents for read-only view / restore.
 */
export async function canSeeDocumentInTrash(
  prisma: PrismaClient,
  userId: string,
  doc: DocumentForPermission & { deletedAt: Date | null }
): Promise<boolean> {
  if (doc.deletedAt == null) return false;
  const owner =
    doc.context?.process?.owner ??
    doc.context?.project?.owner ??
    doc.context?.subcontext?.project?.owner ??
    null;
  if (!owner) {
    return doc.createdById === userId;
  }
  if (owner.ownerUserId === userId) return true;
  if (owner.companyId != null && (await canViewCompany(prisma, userId, owner.companyId)))
    return true;
  if (owner.departmentId != null && (await canViewDepartment(prisma, userId, owner.departmentId)))
    return true;
  if (owner.teamId != null && (await canViewTeam(prisma, userId, owner.teamId))) return true;
  return false;
}
