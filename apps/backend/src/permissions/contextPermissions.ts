import type { PrismaClient } from '../../generated/prisma/client.js';
import { loadUser } from './canRead.js';

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
  if (opts.ownerUserId !== undefined && opts.ownerUserId === userId) return true;
  if (opts.companyId) {
    const isCompanyLead = user.companyLeads.some((c) => c.companyId === opts.companyId);
    if (isCompanyLead) return true;
  }
  if (opts.departmentId) {
    const isDeptLead = user.departmentLeads.some((d) => d.departmentId === opts.departmentId);
    if (isDeptLead) return true;
    const department = await prisma.department.findUnique({
      where: { id: opts.departmentId },
      select: { companyId: true },
    });
    if (department?.companyId) {
      const isCompanyLead = user.companyLeads.some((c) => c.companyId === department.companyId);
      if (isCompanyLead) return true;
    }
  }
  if (opts.teamId) {
    const isTeamLead = user.leadOfTeams.some((l) => l.teamId === opts.teamId);
    if (isTeamLead) return true;
    const team = await prisma.team.findUnique({
      where: { id: opts.teamId },
      include: { department: { select: { id: true, companyId: true } } },
    });
    if (team?.department) {
      const dept = team.department;
      const isDeptLead = user.departmentLeads.some((d) => d.departmentId === dept.id);
      if (isDeptLead) return true;
      if (dept.companyId) {
        const isCompanyLead = user.companyLeads.some((c) => c.companyId === dept.companyId);
        if (isCompanyLead) return true;
      }
    }
  }
  return false;
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
  if (ownerUserId !== null && ownerUserId === userId) return true;

  if (companyId) {
    const isCompanyLead = user.companyLeads.some((c) => c.companyId === companyId);
    if (isCompanyLead) return true;
  }
  if (departmentId) {
    const isDeptLead = user.departmentLeads.some((d) => d.departmentId === departmentId);
    if (isDeptLead) return true;
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { companyId: true },
    });
    if (department?.companyId) {
      const isCompanyLead = user.companyLeads.some((c) => c.companyId === department.companyId);
      if (isCompanyLead) return true;
    }
  }
  if (teamId) {
    const isTeamLead = user.leadOfTeams.some((l) => l.teamId === teamId);
    if (isTeamLead) return true;
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { department: { select: { id: true, companyId: true } } },
    });
    if (team?.department) {
      const dept = team.department;
      const isDeptLead = user.departmentLeads.some((d) => d.departmentId === dept.id);
      if (isDeptLead) return true;
      if (dept.companyId) {
        const isCompanyLead = user.companyLeads.some((c) => c.companyId === dept.companyId);
        if (isCompanyLead) return true;
      }
    }
  }
  return false;
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
  if (ownerUserId !== null && ownerUserId === userId) return true;

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
  if (opts.ownerUserId === userId) return true;
  if (opts.companyId) {
    if (user.companyLeads.some((c) => c.companyId === opts.companyId)) return true;
  }
  if (opts.departmentId) {
    if (user.departmentLeads.some((d) => d.departmentId === opts.departmentId)) return true;
  }
  if (opts.teamId) {
    if (user.teamMemberships.some((m) => m.team.id === opts.teamId)) return true;
  }
  return false;
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
