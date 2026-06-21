import type { PrismaClient } from '../../../../generated/prisma/client.js';
import {
  contextWithOwnerInclude,
  ownerScopeFromOwnerRow,
  type ContextOwnerRow,
  type ContextWithOwnerRow,
} from './ownerScope.js';
import {
  canReadOwnerScopeResolved,
  evaluateScopeCapability,
  resolveHierarchyFromOwnerInput,
} from './scopeVisibility.js';
import type { ScopeHierarchy } from './scopeVisibility.js';
import { loadActiveUser, type LoadedUser } from './userAccessPredicates.js';

/** Context with owner info for Process/Project/Subcontext. */
type ContextWithOwner = {
  id: string;
} & ContextWithOwnerRow;

type OwnerScopeOptions = {
  companyId?: string;
  departmentId?: string;
  teamId?: string;
  ownerUserId?: string;
};

async function loadContext(
  prisma: PrismaClient,
  contextId: string
): Promise<ContextWithOwner | null> {
  const ctx = await prisma.context.findUnique({
    where: { id: contextId },
    include: contextWithOwnerInclude,
  });
  return ctx as ContextWithOwner | null;
}

async function loadActiveUserAndContext(
  prisma: PrismaClient,
  userId: string,
  contextId: string
): Promise<{ user: LoadedUser; ctx: ContextWithOwner } | null> {
  const user = await loadActiveUser(prisma, userId);
  if (!user) return null;
  const ctx = await loadContext(prisma, contextId);
  if (!ctx) return null;
  return { user, ctx };
}

const ownerRowForTagScopeSelect = {
  companyId: true,
  departmentId: true,
  teamId: true,
  ownerUserId: true,
  team: { select: { departmentId: true } },
} as const;

async function loadOwnerOptsForTagScope(
  prisma: PrismaClient,
  ownerId: string
): Promise<OwnerScopeOptions | null> {
  const owner = await prisma.owner.findUnique({
    where: { id: ownerId },
    select: ownerRowForTagScopeSelect,
  });
  if (!owner) return null;
  return {
    companyId: owner.companyId ?? undefined,
    departmentId: owner.departmentId ?? owner.team?.departmentId ?? undefined,
    teamId: owner.teamId ?? undefined,
    ownerUserId: owner.ownerUserId ?? undefined,
  };
}

function getOwnerFromContext(ctx: ContextWithOwner): {
  companyId: string | null;
  departmentId: string | null;
  teamId: string | null;
  ownerUserId: string | null;
} {
  const owner: ContextOwnerRow | null =
    ctx.process?.owner ?? ctx.project?.owner ?? ctx.subcontext?.project?.owner ?? null;
  return ownerScopeFromOwnerRow(owner);
}

function ownerScopeOptionsFromContext(ctx: ContextWithOwner): OwnerScopeOptions {
  const { companyId, departmentId, teamId, ownerUserId } = getOwnerFromContext(ctx);
  return {
    companyId: companyId ?? undefined,
    departmentId: departmentId ?? undefined,
    teamId: teamId ?? undefined,
    ownerUserId: ownerUserId ?? undefined,
  };
}

async function resolveHierarchyFromOwnerOpts(
  prisma: PrismaClient,
  user: LoadedUser,
  opts: OwnerScopeOptions
): Promise<ScopeHierarchy> {
  return resolveHierarchyFromOwnerInput(prisma, user, opts);
}

async function canWriteInOwnerScope(
  prisma: PrismaClient,
  user: LoadedUser,
  userId: string,
  opts: OwnerScopeOptions
): Promise<boolean> {
  if (opts.ownerUserId !== undefined && opts.ownerUserId === userId) return true;
  const hierarchy = await resolveHierarchyFromOwnerOpts(prisma, user, opts);
  if (!hierarchy.companyId && !hierarchy.departmentId && !hierarchy.teamId) return false;
  return evaluateScopeCapability(user, hierarchy, 'lead');
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
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;
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
  const row = await loadActiveUserAndContext(prisma, userId, contextId);
  if (!row) return false;
  const { user, ctx } = row;

  if (user.isAdmin) return true;

  return canWriteInOwnerScope(prisma, user, userId, ownerScopeOptionsFromContext(ctx));
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
  const row = await loadActiveUserAndContext(prisma, userId, contextId);
  if (!row) return false;
  const { user, ctx } = row;

  if (user.isAdmin) return true;

  return canReadOwnerScopeResolved(prisma, user, userId, ownerScopeOptionsFromContext(ctx));
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
  const opts = await loadOwnerOptsForTagScope(prisma, ownerId);
  if (!opts) return false;
  const user = await loadActiveUser(prisma, userId);
  if (!user) return false;
  if (user.isAdmin) return true;
  return canReadOwnerScopeResolved(prisma, user, userId, opts);
}

/**
 * Prüft, ob der Nutzer in diesem Scope Tags anlegen/löschen darf (Scope-Lead oder Admin; Personal = Nutzer selbst).
 */
export async function canCreateTagForOwner(
  prisma: PrismaClient,
  userId: string,
  ownerId: string
): Promise<boolean> {
  const opts = await loadOwnerOptsForTagScope(prisma, ownerId);
  if (!opts) return false;
  return canCreateProcessOrProjectForOwner(prisma, userId, opts);
}
