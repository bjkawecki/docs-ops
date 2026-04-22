import type { PrismaClient } from '../../../../generated/prisma/client.js';
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
} from './userAccessPredicates.js';

/**
 * Prüft, ob der Nutzer TeamMember für das Team anlegen/entfernen darf.
 * true wenn isAdmin, oder Department Lead der Abteilung des Teams, oder Team Lead dieses Teams.
 */
export async function canManageTeamMembers(
  prisma: PrismaClient,
  userId: string,
  teamId: string
): Promise<boolean> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, departmentId: true },
  });
  if (!team) return false;

  if (user.isAdmin) return true;
  if (isDepartmentLead(user, team.departmentId)) return true;
  if (isTeamLead(user, teamId)) return true;
  return false;
}

/**
 * Prüft, ob der Nutzer Team Lead für das Team anlegen/entfernen darf.
 * true wenn isAdmin oder Department Lead der Abteilung des Teams.
 */
export async function canManageTeamLeaders(
  prisma: PrismaClient,
  userId: string,
  teamId: string
): Promise<boolean> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { departmentId: true },
  });
  if (!team) return false;

  if (user.isAdmin) return true;
  if (isDepartmentLead(user, team.departmentId)) return true;
  return false;
}

/**
 * Prüft, ob der Nutzer Department Lead für die Abteilung anlegen/entfernen darf.
 * true nur wenn isAdmin.
 */
export async function canManageDepartmentLeads(
  prisma: PrismaClient,
  userId: string,
  departmentId: string
): Promise<boolean> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!department) return false;

  return user.isAdmin;
}

/**
 * Prüft, ob der Nutzer ein Team einsehen darf (für GET members/leaders).
 * true wenn isAdmin, oder Department Lead der Abteilung, oder Mitglied oder Team Lead des Teams.
 */
export async function canViewTeam(
  prisma: PrismaClient,
  userId: string,
  teamId: string
): Promise<boolean> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { departmentId: true },
  });
  if (!team) return false;

  if (user.isAdmin) return true;
  if (isDepartmentLead(user, team.departmentId)) return true;
  if (isTeamMember(user, teamId)) return true;
  if (isTeamLead(user, teamId)) return true;
  return false;
}

/**
 * Prüft, ob der Nutzer eine Abteilung einsehen darf (für GET department leads).
 * true wenn isAdmin oder Department Lead dieser Abteilung.
 */
export async function canViewDepartment(
  prisma: PrismaClient,
  userId: string,
  departmentId: string
): Promise<boolean> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!department) return false;

  if (user.isAdmin) return true;
  if (isDepartmentLead(user, departmentId)) return true;
  const isTeamLeadInDept = isTeamLeadInDepartment(user, departmentId);
  if (isTeamLeadInDept) return true;
  const isMemberInDept = isMemberInDepartment(user, departmentId);
  if (isMemberInDept) return true;
  return false;
}

/**
 * Prüft, ob der Nutzer Company Lead für die Firma anlegen/entfernen darf.
 * true nur wenn isAdmin.
 */
export async function canManageCompanyLeads(
  prisma: PrismaClient,
  userId: string,
  companyId: string
): Promise<boolean> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) return false;

  return user.isAdmin;
}

/**
 * Prüft, ob der Nutzer eine Firma einsehen darf (für GET company leads).
 * true wenn isAdmin oder Company Lead dieser Firma.
 */
export async function canViewCompany(
  prisma: PrismaClient,
  userId: string,
  companyId: string
): Promise<boolean> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) return false;

  if (user.isAdmin) return true;
  if (isCompanyLead(user, companyId)) return true;
  const deptLeadInCompany = isDeptLeadInCompany(user, companyId);
  if (deptLeadInCompany) return true;
  const teamLeadInCompany = isTeamLeadInCompany(user, companyId);
  if (teamLeadInCompany) return true;
  const memberInCompany = isMemberInCompany(user, companyId);
  if (memberInCompany) return true;
  return false;
}

/**
 * Returns company IDs the user is allowed to view (for filtering GET /companies).
 * Admin: all companies. Otherwise: companies where user is lead, dept lead, team lead, or member.
 */
export async function getVisibleCompanyIds(
  prisma: PrismaClient,
  userId: string
): Promise<string[]> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return [];

  if (user.isAdmin) {
    const companies = await prisma.company.findMany({ select: { id: true } });
    return companies.map((c) => c.id);
  }

  const ids = new Set<string>();
  for (const c of user.companyLeads) if (c.companyId) ids.add(c.companyId);
  for (const d of user.departmentLeads)
    if (d.department?.companyId) ids.add(d.department.companyId);
  for (const l of user.leadOfTeams)
    if (l.team?.department?.companyId) ids.add(l.team.department.companyId);
  for (const m of user.teamMemberships)
    if (m.team?.department?.companyId) ids.add(m.team.department.companyId);
  return [...ids];
}
