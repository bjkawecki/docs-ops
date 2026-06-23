import type { Prisma, PrismaClient } from '../../../../generated/prisma/client.js';

type PrismaDb = PrismaClient | Prisma.TransactionClient;
import type { ScopeRef } from './scopeResolution.js';
import { getContextIdsForScope } from './scopeResolution.js';
import { getWritableCatalogScope } from './catalogPermissions.js';
import {
  isCompanyLead,
  isDepartmentLead,
  isDeptLeadInCompany,
  isMemberInCompany,
  isMemberInDepartment,
  isTeamLead,
  isTeamLeadInCompany,
  isTeamLeadInDepartment,
  isTeamMember,
  loadActiveUser,
  type LoadedUser,
} from './userAccessPredicates.js';

export type ScopeCapability = 'view' | 'lead' | 'readOwner';

/** Resolved org hierarchy for a scope (parents included when known). */
export type ScopeHierarchy = {
  companyId?: string;
  departmentId?: string;
  teamId?: string;
};

export type OwnerScopeInput = {
  companyId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  ownerUserId?: string | null;
};

/**
 * Single decision point for scope hierarchy: view, lead, or readOwner.
 * Personal owner checks belong in {@link canReadOwnerScope}.
 */
export function evaluateScopeCapability(
  user: LoadedUser,
  hierarchy: ScopeHierarchy,
  capability: ScopeCapability
): boolean {
  if (user.isAdmin) return true;

  const effectiveCapability = capability === 'readOwner' ? 'view' : capability;
  const { companyId, departmentId, teamId } = hierarchy;

  if (effectiveCapability === 'view') {
    if (teamId) {
      if (isTeamMember(user, teamId) || isTeamLead(user, teamId)) return true;
      if (departmentId && isDepartmentLead(user, departmentId)) return true;
      if (companyId && isCompanyLead(user, companyId)) return true;
      return false;
    }
    if (departmentId) {
      if (isDepartmentLead(user, departmentId)) return true;
      if (isTeamLeadInDepartment(user, departmentId)) return true;
      if (isMemberInDepartment(user, departmentId)) return true;
      if (companyId && isCompanyLead(user, companyId)) return true;
      return false;
    }
    if (companyId) {
      if (isCompanyLead(user, companyId)) return true;
      if (isDeptLeadInCompany(user, companyId)) return true;
      if (isTeamLeadInCompany(user, companyId)) return true;
      if (isMemberInCompany(user, companyId)) return true;
      return false;
    }
    return false;
  }

  if (teamId) {
    if (isTeamLead(user, teamId)) return true;
    if (departmentId && isDepartmentLead(user, departmentId)) return true;
    if (companyId && isCompanyLead(user, companyId)) return true;
    return false;
  }
  if (departmentId) {
    if (isDepartmentLead(user, departmentId)) return true;
    if (companyId && isCompanyLead(user, companyId)) return true;
    return false;
  }
  if (companyId) {
    return isCompanyLead(user, companyId);
  }
  return false;
}

/**
 * Single decision point for scope people roster visibility (not the same as canViewScope).
 * Admin/company lead see people across the company; dept lead sees own department;
 * team member/lead sees own team only.
 */
export function evaluateScopePeopleCapability(
  user: LoadedUser,
  hierarchy: ScopeHierarchy
): boolean {
  if (user.isAdmin) return true;

  const { companyId, departmentId, teamId } = hierarchy;

  if (teamId) {
    if (companyId && isCompanyLead(user, companyId)) return true;
    return isTeamMember(user, teamId) || isTeamLead(user, teamId);
  }
  if (departmentId) {
    if (companyId && isCompanyLead(user, companyId)) return true;
    return isDepartmentLead(user, departmentId);
  }
  if (companyId) {
    return isCompanyLead(user, companyId);
  }
  return false;
}

function enrichHierarchyFromUser(user: LoadedUser, hierarchy: ScopeHierarchy): ScopeHierarchy {
  const enriched = { ...hierarchy };
  if (enriched.teamId && !enriched.departmentId) {
    const teamRel =
      user.teamMemberships.find((m) => m.team.id === enriched.teamId) ??
      user.leadOfTeams.find((l) => l.teamId === enriched.teamId);
    if (teamRel) {
      enriched.departmentId = teamRel.team.departmentId;
      enriched.companyId ??= teamRel.team.department.companyId;
    }
  }
  if (enriched.departmentId && !enriched.companyId) {
    const deptLead = user.departmentLeads.find((d) => d.departmentId === enriched.departmentId);
    if (deptLead) {
      enriched.companyId = deptLead.department.companyId;
    } else {
      const member = user.teamMemberships.find(
        (m) => m.team.departmentId === enriched.departmentId
      );
      if (member) enriched.companyId = member.team.department.companyId;
    }
  }
  return enriched;
}

export function hierarchyFromOwnerInput(user: LoadedUser, owner: OwnerScopeInput): ScopeHierarchy {
  return enrichHierarchyFromUser(user, {
    companyId: owner.companyId ?? undefined,
    departmentId: owner.departmentId ?? undefined,
    teamId: owner.teamId ?? undefined,
  });
}

export async function resolveHierarchyFromOwnerInput(
  prisma: PrismaDb,
  user: LoadedUser,
  owner: OwnerScopeInput
): Promise<ScopeHierarchy> {
  const hierarchy: ScopeHierarchy = {
    companyId: owner.companyId ?? undefined,
    departmentId: owner.departmentId ?? undefined,
    teamId: owner.teamId ?? undefined,
  };
  if (owner.teamId) {
    const team = await prisma.team.findUnique({
      where: { id: owner.teamId },
      select: {
        departmentId: true,
        department: { select: { companyId: true } },
      },
    });
    if (team) {
      hierarchy.departmentId ??= team.departmentId;
      hierarchy.companyId ??= team.department?.companyId ?? undefined;
    }
  }
  if (owner.departmentId && !hierarchy.companyId) {
    const department = await prisma.department.findUnique({
      where: { id: owner.departmentId },
      select: { companyId: true },
    });
    if (department?.companyId) hierarchy.companyId = department.companyId;
  }
  return enrichHierarchyFromUser(user, hierarchy);
}

/**
 * Whether the user may read content owned by the given org/personal scope (sync, hierarchy must be complete).
 */
export function canReadOwnerScope(
  user: LoadedUser,
  userId: string,
  owner: OwnerScopeInput
): boolean {
  if (owner.ownerUserId != null && owner.ownerUserId === userId) return true;
  if (user.isAdmin) return true;
  const hierarchy = hierarchyFromOwnerInput(user, owner);
  if (!hierarchy.companyId && !hierarchy.departmentId && !hierarchy.teamId) return false;
  return evaluateScopeCapability(user, hierarchy, 'readOwner');
}

/**
 * Whether the user may read content owned by the given scope (resolves parent company/dept from DB).
 */
export async function canReadOwnerScopeResolved(
  prisma: PrismaDb,
  user: LoadedUser,
  userId: string,
  owner: OwnerScopeInput
): Promise<boolean> {
  if (owner.ownerUserId != null && owner.ownerUserId === userId) return true;
  if (user.isAdmin) return true;
  const hierarchy = await resolveHierarchyFromOwnerInput(prisma, user, owner);
  if (!hierarchy.companyId && !hierarchy.departmentId && !hierarchy.teamId) return false;
  return evaluateScopeCapability(user, hierarchy, 'readOwner');
}

export async function resolveScopeHierarchy(
  prisma: PrismaClient,
  scope: ScopeRef
): Promise<ScopeHierarchy | null> {
  switch (scope.type) {
    case 'company': {
      const company = await prisma.company.findUnique({
        where: { id: scope.companyId },
        select: { id: true },
      });
      if (!company) return null;
      return { companyId: scope.companyId };
    }
    case 'department': {
      const department = await prisma.department.findUnique({
        where: { id: scope.departmentId },
        select: { id: true, companyId: true },
      });
      if (!department) return null;
      return { departmentId: scope.departmentId, companyId: department.companyId ?? undefined };
    }
    case 'team': {
      const team = await prisma.team.findUnique({
        where: { id: scope.teamId },
        select: {
          id: true,
          departmentId: true,
          department: { select: { companyId: true } },
        },
      });
      if (!team) return null;
      return {
        teamId: scope.teamId,
        departmentId: team.departmentId,
        companyId: team.department?.companyId ?? undefined,
      };
    }
    default:
      return null;
  }
}

/** Whether the user may view/navigate the org unit (company, department, or team). */
export async function canViewScope(
  prisma: PrismaClient,
  userId: string,
  scope: ScopeRef
): Promise<boolean> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;
  const hierarchy = await resolveScopeHierarchy(prisma, scope);
  if (!hierarchy) return false;
  return evaluateScopeCapability(user, hierarchy, 'view');
}

/** Whether the user is a scope lead for drafts/trash/tabs (Rechtesystem §4b). */
export async function isScopeLead(
  prisma: PrismaClient,
  userId: string,
  scope: ScopeRef
): Promise<boolean> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;
  const hierarchy = await resolveScopeHierarchy(prisma, scope);
  if (!hierarchy) return false;
  return evaluateScopeCapability(user, hierarchy, 'lead');
}

/** Whether the user may view the scope people roster (lead hierarchy; not canViewScope). */
export async function canViewScopePeople(
  prisma: PrismaClient,
  userId: string,
  scope: ScopeRef
): Promise<boolean> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;
  const hierarchy = await resolveScopeHierarchy(prisma, scope);
  if (!hierarchy) return false;
  return evaluateScopePeopleCapability(user, hierarchy);
}

/**
 * Whether the user has write access in the given scope (§4b: scope lead or writable context/document in scope).
 * Used by GET /me/can-write-in-scope.
 */
export async function canWriteInScope(
  prisma: PrismaClient,
  userId: string,
  scope: ScopeRef
): Promise<boolean> {
  const [scopeLead, scopeContextIds, writable] = await Promise.all([
    isScopeLead(prisma, userId, scope),
    getContextIdsForScope(prisma, scope),
    getWritableCatalogScope(prisma, userId),
  ]);
  if (scopeLead) return true;
  const writableCtxSet = new Set(writable.contextIds);
  if (scopeContextIds.some((id) => writableCtxSet.has(id))) return true;
  if (scopeContextIds.length > 0 && writable.documentIdsFromGrants.length > 0) {
    const docInScope = await prisma.document.findFirst({
      where: {
        contextId: { in: scopeContextIds },
        id: { in: writable.documentIdsFromGrants },
      },
      select: { id: true },
    });
    if (docInScope) return true;
  }
  return false;
}
