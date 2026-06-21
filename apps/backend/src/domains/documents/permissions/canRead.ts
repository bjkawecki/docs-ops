import type { Prisma, PrismaClient } from '../../../../generated/prisma/client.js';
import { GrantRole } from '../../../../generated/prisma/client.js';
import { toScopeRef } from '../../organisation/permissions/ownerScope.js';
import {
  canViewScope,
  canReadOwnerScopeResolved,
  evaluateScopeCapability,
} from '../../organisation/permissions/scopeVisibility.js';
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

export function isPersonalContextDocumentOwner(
  owner: ReturnType<typeof getDocumentOwner>,
  userId: string
): boolean {
  return owner?.ownerUserId === userId;
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

/** Nach `loadPermissionSubject`: nur `evaluateBaseDocumentPermission` (canRead/canWrite). */
export function basePermissionDecisionAfterLoad(
  subject: { doc: DocumentForPermission; user: UserForPermission },
  userId: string,
  role: GrantRole,
  teamIds: Set<string>
): boolean | null {
  return evaluateBaseDocumentPermission(subject.doc, subject.user, userId, role, teamIds);
}

export function isCompanyLeadForOwner(
  user: UserForPermission,
  owner: ReturnType<typeof getDocumentOwner>
): boolean {
  const companyId = owner?.companyId ?? null;
  return companyId != null && evaluateScopeCapability(user, { companyId }, 'lead');
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

/** Gemeinsamer Einstieg für canRead/canWrite: Subject laden + Basisentscheidung (ohne weitere Schritte). */
export async function loadPermissionSubjectAndBaseDecision(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
  documentOrId: string | DocumentForPermission,
  role: GrantRole,
  teamIdsForBase: (user: UserForPermission) => Set<string>
): Promise<{
  subject: { doc: DocumentForPermission; user: UserForPermission };
  baseDecision: boolean | null;
} | null> {
  const subject = await loadPermissionSubject(prisma, userId, documentOrId);
  if (!subject) return null;
  const baseDecision = basePermissionDecisionAfterLoad(
    subject,
    userId,
    role,
    teamIdsForBase(subject.user)
  );
  return { subject, baseDecision };
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
  const loaded = await loadPermissionSubjectAndBaseDecision(
    prisma,
    userId,
    documentOrId,
    GrantRole.Read,
    getUserReadableTeamIds
  );
  if (!loaded) return false;
  const { doc, user } = loaded.subject;
  if (loaded.baseDecision !== null) return loaded.baseDecision;

  // 3. Owner of personal context (process/project with ownerUserId)
  const owner = getDocumentOwner(doc);
  if (isPersonalContextDocumentOwner(owner, userId)) return true;

  // 4. Company Lead (contexts with company owner)
  const ownerCompanyId = getContextOwnerCompanyId(doc);
  if (
    ownerCompanyId !== null &&
    evaluateScopeCapability(user, { companyId: ownerCompanyId }, 'lead')
  ) {
    return true;
  }

  // 5. Department Lead (contexts with department/team owner)
  const ownerDeptId = getContextOwnerDepartmentId(doc);
  if (
    ownerDeptId !== null &&
    evaluateScopeCapability(user, { departmentId: ownerDeptId }, 'lead')
  ) {
    return true;
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

  if (doc.publishedAt != null) {
    const owner = getDocumentOwner(doc);
    if (
      owner &&
      (await canReadOwnerScopeResolved(prisma, user, userId, {
        companyId: owner.companyId,
        departmentId: owner.departmentId ?? owner.team?.departmentId ?? null,
        teamId: owner.teamId,
        ownerUserId: owner.ownerUserId,
      }))
    ) {
      return true;
    }
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
  const scopeRef = toScopeRef({
    companyId: owner.companyId,
    departmentId: owner.departmentId ?? owner.team?.departmentId ?? null,
    teamId: owner.teamId,
  });
  if (scopeRef != null && (await canViewScope(prisma, userId, scopeRef))) return true;
  return false;
}
