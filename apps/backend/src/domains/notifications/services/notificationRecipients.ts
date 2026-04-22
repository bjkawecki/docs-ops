import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { GrantRole } from '../../../../generated/prisma/client.js';
import type { DocumentForPermission } from '../../documents/permissions/documentLoad.js';
import { canRead, getDocumentOwner, loadDocument } from '../../documents/permissions/canRead.js';

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

function getOwnerDepartmentId(owner: ReturnType<typeof getDocumentOwner>): string | null {
  if (!owner) return null;
  if (owner.departmentId) return owner.departmentId;
  return owner.team?.departmentId ?? null;
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

async function addUsersInDepartmentsForGrant(
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

function grantTeamIds(doc: DocumentForPermission, role: GrantRole): string[] {
  return doc.grantTeam.filter((g) => g.role === role).map((g) => g.teamId);
}

function grantDepartmentIds(doc: DocumentForPermission, role: GrantRole): string[] {
  return doc.grantDepartment.filter((g) => g.role === role).map((g) => g.departmentId);
}

function addGrantUserIds(doc: DocumentForPermission, role: GrantRole, into: Set<string>): void {
  for (const g of doc.grantUser) {
    if (g.role === role) into.add(g.userId);
  }
}

async function addGrantRecipientsByRole(
  prisma: PrismaClient,
  doc: DocumentForPermission,
  role: GrantRole,
  into: Set<string>,
  teamMode: 'members-and-leads' | 'leads-only'
): Promise<void> {
  addGrantUserIds(doc, role, into);
  const teamIds = grantTeamIds(doc, role);
  if (teamMode === 'members-and-leads') {
    await addTeamMemberUserIdsForTeams(prisma, teamIds, into);
  } else {
    await addTeamLeadUserIdsForTeams(prisma, teamIds, into);
  }
  const departmentIds = grantDepartmentIds(doc, role);
  await addUsersInDepartmentsForGrant(prisma, departmentIds, into);
}

async function collectDocumentCandidateIdsByRole(
  prisma: PrismaClient,
  doc: DocumentForPermission,
  role: GrantRole
): Promise<Set<string>> {
  const ids = new Set<string>();
  await addActiveAdminIds(prisma, ids);

  if (doc.contextId == null || doc.context == null) {
    if (doc.createdById) ids.add(doc.createdById);
    await addGrantRecipientsByRole(
      prisma,
      doc,
      role,
      ids,
      role === GrantRole.Read ? 'members-and-leads' : 'leads-only'
    );
    return ids;
  }

  const owner = getDocumentOwner(doc);
  if (owner?.ownerUserId) ids.add(owner.ownerUserId);
  if (owner?.companyId) await addCompanyLeadUserIds(prisma, owner.companyId, ids);
  if (role === GrantRole.Read) {
    const ownerDeptId = getOwnerDepartmentId(owner);
    if (ownerDeptId) await addDepartmentLeadUserIds(prisma, ownerDeptId, ids);
  }
  await addGrantRecipientsByRole(
    prisma,
    doc,
    role,
    ids,
    role === GrantRole.Read ? 'members-and-leads' : 'leads-only'
  );
  return ids;
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

  const ids = await collectDocumentCandidateIdsByRole(prisma, doc, GrantRole.Read);

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

  const ids = await collectDocumentCandidateIdsByRole(prisma, doc, GrantRole.Write);

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
