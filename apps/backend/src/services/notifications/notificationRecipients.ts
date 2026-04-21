import type { PrismaClient } from '../../../generated/prisma/client.js';
import { GrantRole } from '../../../generated/prisma/client.js';
import type { DocumentForPermission } from '../../permissions/documentLoad.js';
import { canRead, loadDocument } from '../../permissions/canRead.js';

/** Must match `notifications.send` job schema max length. */
export const NOTIFICATION_TARGET_USER_IDS_MAX = 1000;

export function chunkUserIdsForNotificationJobs(userIds: string[]): string[][] {
  if (userIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < userIds.length; i += NOTIFICATION_TARGET_USER_IDS_MAX) {
    chunks.push(userIds.slice(i, i + NOTIFICATION_TARGET_USER_IDS_MAX));
  }
  return chunks;
}

export function excludeUserIds(
  userIds: string[],
  ...exclude: (string | null | undefined)[]
): string[] {
  const skip = new Set(exclude.filter((x): x is string => x != null && x !== ''));
  return userIds.filter((id) => !skip.has(id));
}

export function symmetricDiffUserIds(before: Set<string>, after: Set<string>): string[] {
  const out = new Set<string>();
  for (const id of before) if (!after.has(id)) out.add(id);
  for (const id of after) if (!before.has(id)) out.add(id);
  return [...out];
}

function getContextOwnerCompanyId(doc: DocumentForPermission): string | null {
  if (!doc.context) return null;
  const owner =
    doc.context.process?.owner ??
    doc.context.project?.owner ??
    doc.context.subcontext?.project?.owner ??
    null;
  return owner?.companyId ?? null;
}

function getContextOwnerDepartmentId(doc: DocumentForPermission): string | null {
  if (!doc.context) return null;
  const ctx = doc.context;
  if (ctx.process?.owner) {
    const o = ctx.process.owner;
    if (o.departmentId) return o.departmentId;
    if (o.team?.departmentId) return o.team.departmentId;
    return null;
  }
  if (ctx.project?.owner) {
    const o = ctx.project.owner;
    if (o.departmentId) return o.departmentId;
    if (o.team?.departmentId) return o.team.departmentId;
    return null;
  }
  if (ctx.subcontext?.project?.owner) {
    const o = ctx.subcontext.project.owner;
    if (o.departmentId) return o.departmentId;
    if (o.team?.departmentId) return o.team.departmentId;
    return null;
  }
  return null;
}

async function addActiveAdminIds(prisma: PrismaClient, into: Set<string>): Promise<void> {
  const rows = await prisma.user.findMany({
    where: { isAdmin: true, deletedAt: null },
    select: { id: true },
  });
  for (const r of rows) into.add(r.id);
}

async function addCompanyLeadUserIds(
  prisma: PrismaClient,
  companyId: string,
  into: Set<string>
): Promise<void> {
  const rows = await prisma.companyLead.findMany({
    where: { companyId },
    select: { userId: true },
  });
  for (const r of rows) into.add(r.userId);
}

async function addDepartmentLeadUserIds(
  prisma: PrismaClient,
  departmentId: string,
  into: Set<string>
): Promise<void> {
  const rows = await prisma.departmentLead.findMany({
    where: { departmentId },
    select: { userId: true },
  });
  for (const r of rows) into.add(r.userId);
}

async function addTeamMemberUserIdsForTeams(
  prisma: PrismaClient,
  teamIds: string[],
  into: Set<string>
): Promise<void> {
  if (teamIds.length === 0) return;
  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: teamIds } },
    select: { userId: true },
  });
  const leads = await prisma.teamLead.findMany({
    where: { teamId: { in: teamIds } },
    select: { userId: true },
  });
  for (const r of members) into.add(r.userId);
  for (const r of leads) into.add(r.userId);
}

async function addTeamLeadUserIdsForTeams(
  prisma: PrismaClient,
  teamIds: string[],
  into: Set<string>
): Promise<void> {
  if (teamIds.length === 0) return;
  const leads = await prisma.teamLead.findMany({
    where: { teamId: { in: teamIds } },
    select: { userId: true },
  });
  for (const r of leads) into.add(r.userId);
}

async function addUsersInDepartmentsForReadGrant(
  prisma: PrismaClient,
  departmentIds: string[],
  into: Set<string>
): Promise<void> {
  if (departmentIds.length === 0) return;
  const members = await prisma.teamMember.findMany({
    where: { team: { departmentId: { in: departmentIds } } },
    select: { userId: true },
  });
  const leads = await prisma.teamLead.findMany({
    where: { team: { departmentId: { in: departmentIds } } },
    select: { userId: true },
  });
  for (const r of members) into.add(r.userId);
  for (const r of leads) into.add(r.userId);
}

async function addUsersInDepartmentsForWriteGrant(
  prisma: PrismaClient,
  departmentIds: string[],
  into: Set<string>
): Promise<void> {
  if (departmentIds.length === 0) return;
  const members = await prisma.teamMember.findMany({
    where: { team: { departmentId: { in: departmentIds } } },
    select: { userId: true },
  });
  const leads = await prisma.teamLead.findMany({
    where: { team: { departmentId: { in: departmentIds } } },
    select: { userId: true },
  });
  for (const r of members) into.add(r.userId);
  for (const r of leads) into.add(r.userId);
}

/**
 * Nutzer-IDs für Benachrichtigungen: zuerst heuristische Menge (Grants, Leads, …), danach
 * strikt mit {@link import('../permissions/canRead.js').canRead} gefiltert (keine Drift zu GET /documents).
 * Soft-deleted Nutzer fallen vorher weg.
 */
export async function listUserIdsWhoCanReadDocument(
  prisma: PrismaClient,
  documentId: string
): Promise<string[]> {
  const doc = await loadDocument(prisma, documentId);
  if (!doc) return [];

  const ids = new Set<string>();
  await addActiveAdminIds(prisma, ids);

  if (doc.contextId == null || doc.context == null) {
    if (doc.createdById) ids.add(doc.createdById);
    for (const g of doc.grantUser) {
      if (g.role === GrantRole.Read) ids.add(g.userId);
    }
    const readTeamIds = doc.grantTeam.filter((g) => g.role === GrantRole.Read).map((g) => g.teamId);
    await addTeamMemberUserIdsForTeams(prisma, readTeamIds, ids);
    const readDeptIds = doc.grantDepartment
      .filter((g) => g.role === GrantRole.Read)
      .map((g) => g.departmentId);
    await addUsersInDepartmentsForReadGrant(prisma, readDeptIds, ids);
  } else {
    const owner =
      doc.context.process?.owner ??
      doc.context.project?.owner ??
      doc.context.subcontext?.project?.owner ??
      null;
    if (owner?.ownerUserId) ids.add(owner.ownerUserId);

    const ownerCompanyId = getContextOwnerCompanyId(doc);
    if (ownerCompanyId !== null) {
      await addCompanyLeadUserIds(prisma, ownerCompanyId, ids);
    }

    const ownerDeptId = getContextOwnerDepartmentId(doc);
    if (ownerDeptId !== null) {
      await addDepartmentLeadUserIds(prisma, ownerDeptId, ids);
    }

    for (const g of doc.grantUser) {
      if (g.role === GrantRole.Read) ids.add(g.userId);
    }
    const readTeamIds = doc.grantTeam.filter((g) => g.role === GrantRole.Read).map((g) => g.teamId);
    await addTeamMemberUserIdsForTeams(prisma, readTeamIds, ids);
    const readDeptIds = doc.grantDepartment
      .filter((g) => g.role === GrantRole.Read)
      .map((g) => g.departmentId);
    await addUsersInDepartmentsForReadGrant(prisma, readDeptIds, ids);
  }

  const active = await filterActiveUserIds(prisma, [...ids]);
  const verified: string[] = [];
  for (const uid of active) {
    if (await canRead(prisma, uid, documentId)) verified.push(uid);
  }
  return verified;
}

/**
 * All user ids for whom {@link import('../permissions/canWrite.js').canWrite} would be true for this document.
 */
export async function listUserIdsWhoCanWriteDocument(
  prisma: PrismaClient,
  documentId: string
): Promise<string[]> {
  const doc = await loadDocument(prisma, documentId);
  if (!doc) return [];

  const ids = new Set<string>();
  await addActiveAdminIds(prisma, ids);

  if (doc.contextId == null || doc.context == null) {
    if (doc.createdById) ids.add(doc.createdById);
    for (const g of doc.grantUser) {
      if (g.role === GrantRole.Write) ids.add(g.userId);
    }
    const writeTeamIds = doc.grantTeam
      .filter((g) => g.role === GrantRole.Write)
      .map((g) => g.teamId);
    await addTeamLeadUserIdsForTeams(prisma, writeTeamIds, ids);
    const writeDeptIds = doc.grantDepartment
      .filter((g) => g.role === GrantRole.Write)
      .map((g) => g.departmentId);
    await addUsersInDepartmentsForWriteGrant(prisma, writeDeptIds, ids);
  } else {
    const owner =
      doc.context.process?.owner ??
      doc.context.project?.owner ??
      doc.context.subcontext?.project?.owner ??
      null;
    if (owner?.ownerUserId) ids.add(owner.ownerUserId);

    const companyId = owner?.companyId ?? null;
    if (companyId !== null) {
      await addCompanyLeadUserIds(prisma, companyId, ids);
    }

    for (const g of doc.grantUser) {
      if (g.role === GrantRole.Write) ids.add(g.userId);
    }
    const writeTeamIds = doc.grantTeam
      .filter((g) => g.role === GrantRole.Write)
      .map((g) => g.teamId);
    await addTeamLeadUserIdsForTeams(prisma, writeTeamIds, ids);
    const writeDeptIds = doc.grantDepartment
      .filter((g) => g.role === GrantRole.Write)
      .map((g) => g.departmentId);
    await addUsersInDepartmentsForWriteGrant(prisma, writeDeptIds, ids);
  }

  return filterActiveUserIds(prisma, [...ids]);
}

async function filterActiveUserIds(
  prisma: PrismaClient,
  candidateIds: string[]
): Promise<string[]> {
  if (candidateIds.length === 0) return [];
  const unique = [...new Set(candidateIds)];
  const active = await prisma.user.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: { id: true },
  });
  return active.map((u) => u.id);
}

type ContextOwnerRow = {
  companyId: string | null;
  departmentId: string | null;
  teamId: string | null;
  ownerUserId: string | null;
  team: { departmentId: string } | null;
};

function ownerFromContextRow(ctx: {
  process: { owner: ContextOwnerRow } | null;
  project: { owner: ContextOwnerRow } | null;
  subcontext: { project: { owner: ContextOwnerRow } } | null;
}): ContextOwnerRow | null {
  return ctx.process?.owner ?? ctx.project?.owner ?? ctx.subcontext?.project?.owner ?? null;
}

/**
 * Users who may merge/reject draft requests on documents in this context
 * (aligned with {@link import('../permissions/contextPermissions.js').canWriteContext}).
 */
export async function listUserIdsWhoCanWriteContext(
  prisma: PrismaClient,
  contextId: string
): Promise<string[]> {
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
  if (!ctx) return [];

  const owner = ownerFromContextRow(ctx);
  if (!owner)
    return filterActiveUserIds(prisma, [...(await collectWriteContextUserIds(prisma, null))]);

  const departmentId = owner.departmentId ?? owner.team?.departmentId ?? null;
  const ids = await collectWriteContextUserIds(prisma, {
    companyId: owner.companyId,
    departmentId,
    teamId: owner.teamId,
    ownerUserId: owner.ownerUserId,
  });
  return filterActiveUserIds(prisma, ids);
}

async function collectWriteContextUserIds(
  prisma: PrismaClient,
  owner: {
    companyId: string | null;
    departmentId: string | null;
    teamId: string | null;
    ownerUserId: string | null;
  } | null
): Promise<string[]> {
  const ids = new Set<string>();
  await addActiveAdminIds(prisma, ids);
  if (!owner) return [...ids];

  if (owner.ownerUserId) ids.add(owner.ownerUserId);

  if (owner.companyId) {
    await addCompanyLeadUserIds(prisma, owner.companyId, ids);
  }
  if (owner.departmentId) {
    await addDepartmentLeadUserIds(prisma, owner.departmentId, ids);
    const dep = await prisma.department.findUnique({
      where: { id: owner.departmentId },
      select: { companyId: true },
    });
    if (dep?.companyId) {
      await addCompanyLeadUserIds(prisma, dep.companyId, ids);
    }
  }
  if (owner.teamId) {
    await addTeamLeadUserIdsForTeams(prisma, [owner.teamId], ids);
    const team = await prisma.team.findUnique({
      where: { id: owner.teamId },
      include: { department: { select: { id: true, companyId: true } } },
    });
    if (team?.department) {
      await addDepartmentLeadUserIds(prisma, team.department.id, ids);
      if (team.department.companyId) {
        await addCompanyLeadUserIds(prisma, team.department.companyId, ids);
      }
    }
  }
  return [...ids];
}

export async function listUserIdsWhoCanMergeDraftRequestOnDocument(
  prisma: PrismaClient,
  documentId: string
): Promise<string[]> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { contextId: true },
  });
  if (doc?.contextId == null) return [];
  return listUserIdsWhoCanWriteContext(prisma, doc.contextId);
}

/** Union of readers and writers (for trash/delete style notifications). */
export async function listUserIdsWhoCanReadOrWriteDocument(
  prisma: PrismaClient,
  documentId: string
): Promise<string[]> {
  const [readers, writers] = await Promise.all([
    listUserIdsWhoCanReadDocument(prisma, documentId),
    listUserIdsWhoCanWriteDocument(prisma, documentId),
  ]);
  return filterActiveUserIds(prisma, [...new Set([...readers, ...writers])]);
}
