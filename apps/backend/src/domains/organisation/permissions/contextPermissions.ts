import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { loadUser } from '../../documents/permissions/canRead.js';

/** Context with owner info for Process/Project/Subcontext. */
type ContextWithOwner = {
  id: string;
  process: {
    owner: {
      companyId: string | null;
      departmentId: string | null;
      teamId: string | null;
      ownerUserId: string | null;
      team: { departmentId: string } | null;
    };
  } | null;
  project: {
    owner: {
      companyId: string | null;
      departmentId: string | null;
      teamId: string | null;
      ownerUserId: string | null;
      team: { departmentId: string } | null;
    };
  } | null;
  subcontext: {
    project: {
      owner: {
        companyId: string | null;
        departmentId: string | null;
        teamId: string | null;
        ownerUserId: string | null;
        team: { departmentId: string } | null;
      };
    };
  } | null;
};

type OwnerScopeOptions = {
  companyId?: string;
  departmentId?: string;
  teamId?: string;
  ownerUserId?: string;
};

type LoadedUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

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
              ownerUserId: true,
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
              ownerUserId: true,
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
                  ownerUserId: true,
                  team: { select: { departmentId: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  return ctx as ContextWithOwner | null;
}

function getOwnerFromContext(ctx: ContextWithOwner): {
  companyId: string | null;
  departmentId: string | null;
  teamId: string | null;
  ownerUserId: string | null;
} {
  const owner = ctx.process?.owner ?? ctx.project?.owner ?? ctx.subcontext?.project?.owner ?? null;
  if (!owner) return { companyId: null, departmentId: null, teamId: null, ownerUserId: null };
  const departmentId = owner.departmentId ?? owner.team?.departmentId ?? null;
  return {
    companyId: owner.companyId,
    departmentId,
    teamId: owner.teamId,
    ownerUserId: owner.ownerUserId,
  };
}

function isCompanyLead(user: LoadedUser, companyId: string): boolean {
  return user.companyLeads.some((c) => c.companyId === companyId);
}

function isDepartmentLead(user: LoadedUser, departmentId: string): boolean {
  return user.departmentLeads.some((d) => d.departmentId === departmentId);
}

function isTeamLead(user: LoadedUser, teamId: string): boolean {
  return user.leadOfTeams.some((l) => l.teamId === teamId);
}

async function canWriteInOwnerScope(
  prisma: PrismaClient,
  user: LoadedUser,
  userId: string,
  opts: OwnerScopeOptions
): Promise<boolean> {
  if (opts.ownerUserId !== undefined && opts.ownerUserId === userId) return true;
  if (opts.companyId && isCompanyLead(user, opts.companyId)) return true;

  if (opts.departmentId) {
    if (isDepartmentLead(user, opts.departmentId)) return true;
    const department = await prisma.department.findUnique({
      where: { id: opts.departmentId },
      select: { companyId: true },
    });
    if (department?.companyId && isCompanyLead(user, department.companyId)) return true;
  }

  if (opts.teamId) {
    if (isTeamLead(user, opts.teamId)) return true;
    const team = await prisma.team.findUnique({
      where: { id: opts.teamId },
      include: { department: { select: { id: true, companyId: true } } },
    });
    if (!team?.department) return false;
    if (isDepartmentLead(user, team.department.id)) return true;
    if (team.department.companyId && isCompanyLead(user, team.department.companyId)) return true;
  }

  return false;
}

function canReadInOwnerScope(user: LoadedUser, userId: string, opts: OwnerScopeOptions): boolean {
  if (opts.ownerUserId === userId) return true;

  if (opts.companyId) {
    if (isCompanyLead(user, opts.companyId)) return true;
    if (user.departmentLeads.some((d) => d.department.companyId === opts.companyId)) return true;
    if (user.leadOfTeams.some((l) => l.team.department.companyId === opts.companyId)) return true;
    if (user.teamMemberships.some((m) => m.team.department.companyId === opts.companyId))
      return true;
  }

  if (opts.departmentId) {
    if (isDepartmentLead(user, opts.departmentId)) return true;
    if (user.leadOfTeams.some((l) => l.team.departmentId === opts.departmentId)) return true;
    if (user.teamMemberships.some((m) => m.team.departmentId === opts.departmentId)) return true;
  }

  if (opts.teamId && user.teamMemberships.some((m) => m.team.id === opts.teamId)) return true;
  return false;
}

/**
 * Checks if the user may create a process/project for the given owner (companyId, departmentId, teamId or ownerUserId).
 * Personal (ownerUserId): only the user themselves. Org: Admin, Company/Department/Team Lead as per hierarchy.
 */
export async function canCreateProcessOrProjectForOwner(
  prisma: PrismaClient,
  userId: string,
  opts: { companyId?: string; departmentId?: string; teamId?: string; ownerUserId?: string }
): Promise<boolean> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;
  if (user.isAdmin) return true;
  return canWriteInOwnerScope(prisma, user, userId, opts);
}

/**
 * Checks if the user may write the context (create/edit/delete Process/Project/Subcontext).
 * isAdmin; or Owner of personal context (ownerUserId); or Company/Department/Team Lead of owner unit.
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

  const { companyId, departmentId, teamId, ownerUserId } = getOwnerFromContext(ctx);
  return canWriteInOwnerScope(prisma, user, userId, {
    companyId: companyId ?? undefined,
    departmentId: departmentId ?? undefined,
    teamId: teamId ?? undefined,
    ownerUserId: ownerUserId ?? undefined,
  });
}

/**
 * Checks if the user may read the context (list documents, view context).
 * isAdmin; or Owner of personal context (ownerUserId); or Company/Department Lead or Team member of owner unit.
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

  const { companyId, departmentId, teamId, ownerUserId } = getOwnerFromContext(ctx);
  return canReadInOwnerScope(user, userId, {
    companyId: companyId ?? undefined,
    departmentId: departmentId ?? undefined,
    teamId: teamId ?? undefined,
    ownerUserId: ownerUserId ?? undefined,
  });
}

/**
 * Liefert die ownerId des Kontexts (Process, Project oder Subcontext → Projekt-Owner).
 * Für Tag-Scope und Dokument-Tag-Validierung.
 */
export async function getContextOwnerId(
  prisma: PrismaClient,
  contextId: string
): Promise<string | null> {
  const ctx = await prisma.context.findUnique({
    where: { id: contextId },
    select: {
      process: { select: { ownerId: true } },
      project: { select: { ownerId: true } },
      subcontext: { select: { project: { select: { ownerId: true } } } },
    },
  });
  if (!ctx) return null;
  return ctx.process?.ownerId ?? ctx.project?.ownerId ?? ctx.subcontext?.project?.ownerId ?? null;
}

/**
 * Prüft, ob der Nutzer Tags im Scope dieses Owners lesen darf (Tags auflisten).
 * Admin; Personal-Owner selbst; Company/Department/Team: Mitglied oder Lead der Unit bzw. übergeordnet.
 */
export async function canReadScopeForOwner(
  prisma: PrismaClient,
  userId: string,
  ownerId: string
): Promise<boolean> {
  const owner = await prisma.owner.findUnique({
    where: { id: ownerId },
    select: {
      companyId: true,
      departmentId: true,
      teamId: true,
      ownerUserId: true,
      team: { select: { departmentId: true } },
    },
  });
  if (!owner) return false;
  const opts = {
    companyId: owner.companyId ?? undefined,
    departmentId: owner.departmentId ?? owner.team?.departmentId ?? undefined,
    teamId: owner.teamId ?? undefined,
    ownerUserId: owner.ownerUserId ?? undefined,
  };
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) return false;
  if (user.isAdmin) return true;
  return canReadInOwnerScope(user, userId, opts);
}

/**
 * Prüft, ob der Nutzer in diesem Scope Tags anlegen/löschen darf (Scope-Lead oder Admin; Personal = Nutzer selbst).
 */
export async function canCreateTagForOwner(
  prisma: PrismaClient,
  userId: string,
  ownerId: string
): Promise<boolean> {
  const owner = await prisma.owner.findUnique({
    where: { id: ownerId },
    select: {
      companyId: true,
      departmentId: true,
      teamId: true,
      ownerUserId: true,
      team: { select: { departmentId: true } },
    },
  });
  if (!owner) return false;
  return canCreateProcessOrProjectForOwner(prisma, userId, {
    companyId: owner.companyId ?? undefined,
    departmentId: owner.departmentId ?? owner.team?.departmentId ?? undefined,
    teamId: owner.teamId ?? undefined,
    ownerUserId: owner.ownerUserId ?? undefined,
  });
}
