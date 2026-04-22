import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { loadUser } from '../../documents/permissions/canRead.js';

export type VisiblePinnedScopes = {
  teamIds: string[];
  departmentIds: string[];
  companyIds: string[];
};

/**
 * Prüft, ob der Nutzer für den angegebenen Scope (Team/Department/Company) an- oder abpinnen darf.
 * Nur Scope-Lead (Team Lead, Department Lead, Company Lead) und Admin.
 */
export async function canPinForScope(
  prisma: PrismaClient,
  userId: string,
  scopeType: 'team' | 'department' | 'company',
  scopeId: string
): Promise<boolean> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

  if (user.isAdmin) return true;

  switch (scopeType) {
    case 'team':
      return user.leadOfTeams.some((l) => l.teamId === scopeId);
    case 'department':
      return user.departmentLeads.some((d) => d.departmentId === scopeId);
    case 'company':
      return user.companyLeads.some((c) => c.companyId === scopeId);
    default:
      return false;
  }
}

/**
 * Gibt die Menge der (scopeType, scopeId)-Kombinationen zurück, für die der Nutzer Pins sehen darf.
 * Team-Pins: Teams, in denen er Mitglied ist.
 * Department-Pins: Departments aus Team-Mitgliedschaften + Departments, in denen er Lead ist.
 * Company-Pins: Es gibt nur eine Company – eine companyId, wenn der Nutzer über Team/Department dazu gehört oder Company Lead ist.
 */
export async function getVisiblePinnedScopeIds(
  prisma: PrismaClient,
  userId: string
): Promise<VisiblePinnedScopes> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) {
    return { teamIds: [], departmentIds: [], companyIds: [] };
  }

  if (user.isAdmin) {
    const [teams, departments, companies] = await Promise.all([
      prisma.team.findMany({ select: { id: true } }),
      prisma.department.findMany({ select: { id: true } }),
      prisma.company.findMany({ select: { id: true } }),
    ]);
    return {
      teamIds: teams.map((t) => t.id),
      departmentIds: departments.map((d) => d.id),
      companyIds: companies.map((c) => c.id),
    };
  }

  const teamIds = [
    ...user.teamMemberships.map((m) => m.team.id),
    ...user.leadOfTeams.map((l) => l.teamId),
  ];
  const departmentIdsFromTeams = [
    ...user.teamMemberships.map((m) => m.team.departmentId),
    ...user.leadOfTeams.map((l) => l.team.departmentId),
  ];
  const departmentLeadIds = user.departmentLeads.map((d) => d.departmentId);
  const departmentIds = [...new Set([...departmentIdsFromTeams, ...departmentLeadIds])];

  const companyIds: string[] = [];
  if (user.companyLeads.length > 0) {
    companyIds.push(...user.companyLeads.map((c) => c.companyId));
  }
  if (departmentIds.length > 0 && companyIds.length === 0) {
    const depts = await prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { companyId: true },
    });
    const ids = [
      ...new Set(depts.map((d) => d.companyId).filter((id): id is string => id != null)),
    ];
    companyIds.push(...ids);
  }
  if (teamIds.length > 0 && companyIds.length === 0) {
    const firstTeam = await prisma.team.findFirst({
      where: { id: { in: teamIds } },
      select: { department: { select: { companyId: true } } },
    });
    if (firstTeam?.department?.companyId) {
      companyIds.push(firstTeam.department.companyId);
    }
  }

  return {
    teamIds,
    departmentIds,
    companyIds: [...new Set(companyIds)],
  };
}
