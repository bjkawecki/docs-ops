import type { PrismaClient } from '../../generated/prisma/client.js';
import { loadUser } from './canRead.js';

/**
 * Prüft, ob der Nutzer TeamMember für das Team anlegen/entfernen darf.
 * true wenn isAdmin, oder Supervisor der Abteilung des Teams, oder TeamLeader dieses Teams.
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
  if (user.supervisorOfDepartments.some((s) => s.departmentId === team.departmentId)) return true;
  if (user.leaderOfTeams.some((l) => l.teamId === teamId)) return true;
  return false;
}

/**
 * Prüft, ob der Nutzer TeamLeader für das Team anlegen/entfernen darf.
 * true wenn isAdmin oder Supervisor der Abteilung des Teams.
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
  if (user.supervisorOfDepartments.some((s) => s.departmentId === team.departmentId)) return true;
  return false;
}

/**
 * Prüft, ob der Nutzer Supervisor für die Abteilung anlegen/entfernen darf.
 * true nur wenn isAdmin.
 */
export async function canManageSupervisors(
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
 * true wenn isAdmin, oder Supervisor der Abteilung, oder Mitglied oder Leader des Teams.
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
  if (user.supervisorOfDepartments.some((s) => s.departmentId === team.departmentId)) return true;
  if (user.teamMemberships.some((m) => m.team.id === teamId)) return true;
  if (user.leaderOfTeams.some((l) => l.teamId === teamId)) return true;
  return false;
}

/**
 * Prüft, ob der Nutzer eine Abteilung einsehen darf (für GET supervisors).
 * true wenn isAdmin oder Supervisor dieser Abteilung.
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
  if (user.supervisorOfDepartments.some((s) => s.departmentId === departmentId)) return true;
  return false;
}
