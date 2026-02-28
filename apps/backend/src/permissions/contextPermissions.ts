import type { PrismaClient } from '../../generated/prisma/client.js';
import { loadUser } from './canRead.js';

/** Context inkl. Owner-Infos für Process/Project/Subcontext und UserSpace. */
type ContextWithOwner = {
  id: string;
  process: {
    owner: {
      departmentId: string | null;
      teamId: string | null;
      team: { departmentId: string } | null;
    };
  } | null;
  project: {
    owner: {
      departmentId: string | null;
      teamId: string | null;
      team: { departmentId: string } | null;
    };
  } | null;
  subcontext: {
    project: {
      owner: {
        departmentId: string | null;
        teamId: string | null;
        team: { departmentId: string } | null;
      };
    };
  } | null;
  userSpace: { ownerUserId: string } | null;
};

async function loadContext(
  prisma: PrismaClient,
  contextId: string
): Promise<ContextWithOwner | null> {
  const ctx = await prisma.context.findUnique({
    where: { id: contextId },
    include: {
      process: {
        include: {
          owner: {
            select: {
              departmentId: true,
              teamId: true,
              team: { select: { departmentId: true } },
            },
          },
        },
      },
      project: {
        include: {
          owner: {
            select: {
              departmentId: true,
              teamId: true,
              team: { select: { departmentId: true } },
            },
          },
        },
      },
      subcontext: {
        include: {
          project: {
            include: {
              owner: {
                select: {
                  departmentId: true,
                  teamId: true,
                  team: { select: { departmentId: true } },
                },
              },
            },
          },
        },
      },
      userSpace: { select: { ownerUserId: true } },
    },
  });
  return ctx as ContextWithOwner | null;
}

function getOwnerFromContext(ctx: ContextWithOwner): {
  departmentId: string | null;
  teamId: string | null;
} {
  const owner = ctx.process?.owner ?? ctx.project?.owner ?? ctx.subcontext?.project?.owner ?? null;
  if (!owner) return { departmentId: null, teamId: null };
  const departmentId = owner.departmentId ?? owner.team?.departmentId ?? null;
  return { departmentId, teamId: owner.teamId };
}

/**
 * Prüft, ob der Nutzer einen Prozess/Projekt für den angegebenen Owner (departmentId oder teamId) anlegen darf.
 * isAdmin, Supervisor der Abteilung, Team-Leader des Teams.
 */
export async function canCreateProcessOrProjectForOwner(
  prisma: PrismaClient,
  userId: string,
  opts: { departmentId?: string; teamId?: string }
): Promise<boolean> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;
  if (user.isAdmin) return true;
  if (opts.departmentId) {
    const isSupervisor = user.supervisorOfDepartments.some(
      (s) => s.departmentId === opts.departmentId
    );
    if (isSupervisor) return true;
  }
  if (opts.teamId) {
    const isLeader = user.leaderOfTeams.some((l) => l.teamId === opts.teamId);
    if (isLeader) return true;
  }
  return false;
}

/**
 * Prüft, ob der Nutzer den Kontext schreiben darf (Process/Project/Subcontext anlegen, ändern, löschen).
 * isAdmin, Supervisor (Owner-Abteilung), Team-Leader (Owner-Team); UserSpace: nur Owner oder isAdmin.
 */
export async function canWriteContext(
  prisma: PrismaClient,
  userId: string,
  contextId: string
): Promise<boolean> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

  const ctx = await loadContext(prisma, contextId);
  if (!ctx) return false;

  if (user.isAdmin) return true;

  if (ctx.userSpace) {
    return ctx.userSpace.ownerUserId === userId;
  }

  const { departmentId, teamId } = getOwnerFromContext(ctx);
  if (departmentId) {
    const isSupervisor = user.supervisorOfDepartments.some((s) => s.departmentId === departmentId);
    if (isSupervisor) return true;
  }
  if (teamId) {
    const isLeader = user.leaderOfTeams.some((l) => l.teamId === teamId);
    if (isLeader) return true;
  }
  return false;
}

/**
 * Prüft, ob der Nutzer den Kontext lesen darf (Dokumente auflisten, Kontext anzeigen).
 * isAdmin, UserSpace-Owner, Supervisor (Owner-Abteilung), Mitglied eines Owner-Teams.
 */
export async function canReadContext(
  prisma: PrismaClient,
  userId: string,
  contextId: string
): Promise<boolean> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;

  const ctx = await loadContext(prisma, contextId);
  if (!ctx) return false;

  if (user.isAdmin) return true;

  if (ctx.userSpace) {
    return ctx.userSpace.ownerUserId === userId;
  }

  const { departmentId, teamId } = getOwnerFromContext(ctx);
  if (departmentId) {
    const isSupervisor = user.supervisorOfDepartments.some((s) => s.departmentId === departmentId);
    if (isSupervisor) return true;
  }
  if (teamId) {
    const isMember = user.teamMemberships.some((m) => m.team.id === teamId);
    if (isMember) return true;
  }
  return false;
}
