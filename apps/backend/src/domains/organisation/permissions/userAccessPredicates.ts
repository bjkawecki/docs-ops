import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { loadUser } from '../../documents/permissions/canRead.js';

export type LoadedUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

export async function loadActiveUser(
  prisma: PrismaClient,
  userId: string
): Promise<LoadedUser | null> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return null;
  return user;
}

export function isCompanyLead(user: LoadedUser, companyId: string): boolean {
  return user.companyLeads.some((c) => c.companyId === companyId);
}

export function isDepartmentLead(user: LoadedUser, departmentId: string): boolean {
  return user.departmentLeads.some((d) => d.departmentId === departmentId);
}

export function isTeamLead(user: LoadedUser, teamId: string): boolean {
  return user.leadOfTeams.some((l) => l.teamId === teamId);
}

export function isTeamMember(user: LoadedUser, teamId: string): boolean {
  return user.teamMemberships.some((m) => m.team.id === teamId);
}

export function isTeamLeadInDepartment(user: LoadedUser, departmentId: string): boolean {
  return user.leadOfTeams.some((l) => l.team.departmentId === departmentId);
}

export function isMemberInDepartment(user: LoadedUser, departmentId: string): boolean {
  return user.teamMemberships.some((m) => m.team.departmentId === departmentId);
}

export function isDeptLeadInCompany(user: LoadedUser, companyId: string): boolean {
  return user.departmentLeads.some((d) => d.department.companyId === companyId);
}

export function isTeamLeadInCompany(user: LoadedUser, companyId: string): boolean {
  return user.leadOfTeams.some((l) => l.team.department.companyId === companyId);
}

export function isMemberInCompany(user: LoadedUser, companyId: string): boolean {
  return user.teamMemberships.some((m) => m.team.department.companyId === companyId);
}
