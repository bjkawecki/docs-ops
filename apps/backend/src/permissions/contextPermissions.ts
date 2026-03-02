import type { PrismaClient } from '../../generated/prisma/client.js';
import { loadUser } from './canRead.js';

/** Context inkl. Owner-Infos für Process/Project/Subcontext und UserSpace. */
type ContextWithOwner = {
  id: string;
  process: {
    owner: {
      companyId: string | null;
      departmentId: string | null;
      teamId: string | null;
      team: { departmentId: string } | null;
    };
  } | null;
  project: {
    owner: {
      companyId: string | null;
      departmentId: string | null;
      teamId: string | null;
      team: { departmentId: string } | null;
    };
  } | null;
  subcontext: {
    project: {
      owner: {
        companyId: string | null;
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
              companyId: true,
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
              companyId: true,
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
                  companyId: true,
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
  companyId: string | null;
  departmentId: string | null;
  teamId: string | null;
} {
  const owner = ctx.process?.owner ?? ctx.project?.owner ?? ctx.subcontext?.project?.owner ?? null;
  if (!owner) return { companyId: null, departmentId: null, teamId: null };
  const departmentId = owner.departmentId ?? owner.team?.departmentId ?? null;
  return { companyId: owner.companyId, departmentId, teamId: owner.teamId };
}

/**
 * Prüft, ob der Nutzer einen Prozess/Projekt für den angegebenen Owner (companyId, departmentId oder teamId) anlegen darf.
 * isAdmin, Company Lead der Firma, Department Lead der Abteilung, Team Lead des Teams.
 */
export async function canCreateProcessOrProjectForOwner(
  prisma: PrismaClient,
  userId: string,
  opts: { companyId?: string; departmentId?: string; teamId?: string }
): Promise<boolean> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;
  if (user.isAdmin) return true;
  if (opts.companyId) {
    const isCompanyLead = user.companyLeads.some((c) => c.companyId === opts.companyId);
    if (isCompanyLead) return true;
  }
  if (opts.departmentId) {
    const isDeptLead = user.departmentLeads.some((d) => d.departmentId === opts.departmentId);
    if (isDeptLead) return true;
  }
  if (opts.teamId) {
    const isTeamLead = user.leadOfTeams.some((l) => l.teamId === opts.teamId);
    if (isTeamLead) return true;
  }
  return false;
}

/**
 * Prüft, ob der Nutzer den Kontext schreiben darf (Process/Project/Subcontext anlegen, ändern, löschen).
 * isAdmin, Department Lead (Owner-Abteilung), Team Lead (Owner-Team); UserSpace: nur Owner oder isAdmin.
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
    const isDeptLead = user.departmentLeads.some((d) => d.departmentId === departmentId);
    if (isDeptLead) return true;
  }
  if (teamId) {
    const isTeamLead = user.leadOfTeams.some((l) => l.teamId === teamId);
    if (isTeamLead) return true;
  }
  return false;
}

/**
 * Prüft, ob der Nutzer den Kontext lesen darf (Dokumente auflisten, Kontext anzeigen).
 * isAdmin, UserSpace-Owner, Department Lead (Owner-Abteilung), Mitglied eines Owner-Teams.
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

  const { companyId, departmentId, teamId } = getOwnerFromContext(ctx);
  if (companyId) {
    const isCompanyLead = user.companyLeads.some((c) => c.companyId === companyId);
    if (isCompanyLead) return true;
  }
  if (departmentId) {
    const isDeptLead = user.departmentLeads.some((d) => d.departmentId === departmentId);
    if (isDeptLead) return true;
  }
  if (teamId) {
    const isMember = user.teamMemberships.some((m) => m.team.id === teamId);
    if (isMember) return true;
  }
  return false;
}
