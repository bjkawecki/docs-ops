import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ScopeRef } from './scopeResolution.js';
import { getContextIdsForScope } from './scopeResolution.js';
import { getWritableCatalogScope } from './catalogPermissions.js';
import { canViewDepartment, canViewCompany } from './assignmentPermissions.js';

/**
 * Returns whether the user is a "scope lead" for the given scope (company, department, or team).
 * Company: user is company lead (or admin). Department: user is department lead or company lead.
 * Team: user is team lead, department lead, or company lead.
 */
export async function getScopeLead(
  prisma: PrismaClient,
  userId: string,
  scope: ScopeRef
): Promise<boolean> {
  switch (scope.type) {
    case 'company':
      return canViewCompany(prisma, userId, scope.companyId);
    case 'department': {
      const department = await prisma.department.findUnique({
        where: { id: scope.departmentId },
        select: { companyId: true },
      });
      if (!department) return false;
      const [dept, company] = await Promise.all([
        canViewDepartment(prisma, userId, scope.departmentId),
        department.companyId != null
          ? canViewCompany(prisma, userId, department.companyId)
          : Promise.resolve(false),
      ]);
      return dept || (department.companyId != null && company);
    }
    case 'team': {
      const team = await prisma.team.findUnique({
        where: { id: scope.teamId },
        select: { departmentId: true, department: { select: { companyId: true } } },
      });
      if (!team) return false;
      const companyId = team.department?.companyId ?? null;
      const [scopeLeadDept, scopeLeadCompany, isTeamLead] = await Promise.all([
        team.departmentId != null
          ? canViewDepartment(prisma, userId, team.departmentId)
          : Promise.resolve(false),
        companyId != null ? canViewCompany(prisma, userId, companyId) : Promise.resolve(false),
        prisma.teamLead
          .findUnique({
            where: { teamId_userId: { teamId: scope.teamId, userId } },
            select: { userId: true },
          })
          .then((r) => r != null),
      ]);
      return scopeLeadDept || scopeLeadCompany || isTeamLead;
    }
    default:
      return false;
  }
}

/**
 * Returns whether the user has write access in the given scope (§4b: scope lead or writable context/document in scope).
 * Used by GET /me/can-write-in-scope.
 */
export async function canWriteInScope(
  prisma: PrismaClient,
  userId: string,
  scope: ScopeRef
): Promise<boolean> {
  const [scopeLead, scopeContextIds, writable] = await Promise.all([
    getScopeLead(prisma, userId, scope),
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
