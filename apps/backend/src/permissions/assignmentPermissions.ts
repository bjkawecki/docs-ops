import type { PrismaClient } from '../../generated/prisma/client.js';
import { loadUser } from './canRead.js';

/**
 * Prüft, ob der Nutzer TeamMember für das Team anlegen/entfernen darf.
 * true wenn isAdmin, oder Department Lead der Abteilung des Teams, oder Team Lead dieses Teams.
 */
export async function canManageTeamMembers(
  prisma: PrismaClient,
  userId: string,
  teamId: string
): Promise<boolean> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, departmentId: true },
  });
  if (!team) return false;

  if (user.isAdmin) return true;
  if (user.departmentLeads.some((d) => d.departmentId === team.departmentId)) return true;
  if (user.leadOfTeams.some((l) => l.teamId === teamId)) return true;
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
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { departmentId: true },
  });
  if (!team) return false;

  if (user.isAdmin) return true;
  if (user.departmentLeads.some((d) => d.departmentId === team.departmentId)) return true;
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
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

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
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { departmentId: true },
  });
  if (!team) return false;

  if (user.isAdmin) return true;
  if (user.departmentLeads.some((d) => d.departmentId === team.departmentId)) return true;
  if (user.teamMemberships.some((m) => m.team.id === teamId)) return true;
  if (user.leadOfTeams.some((l) => l.teamId === teamId)) return true;
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
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!department) return false;

  if (user.isAdmin) return true;
  if (user.departmentLeads.some((d) => d.departmentId === departmentId)) return true;
  const isTeamLeadInDept = user.leadOfTeams.some((l) => l.team.departmentId === departmentId);
  if (isTeamLeadInDept) return true;
  const isMemberInDept = user.teamMemberships.some((m) => m.team.departmentId === departmentId);
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
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

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
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) return false;

  if (user.isAdmin) return true;
  if (user.companyLeads.some((c) => c.companyId === companyId)) return true;
  const isDeptLeadInCompany = user.departmentLeads.some(
    (d) => d.department.companyId === companyId
  );
  if (isDeptLeadInCompany) return true;
  const isTeamLeadInCompany = user.leadOfTeams.some(
    (l) => l.team.department.companyId === companyId
  );
  if (isTeamLeadInCompany) return true;
  const isMemberInCompany = user.teamMemberships.some(
    (m) => m.team.department.companyId === companyId
  );
  if (isMemberInCompany) return true;
  return false;
}
