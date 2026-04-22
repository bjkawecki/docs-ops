import type { PrismaClient, GrantRole } from '../../../../../generated/prisma/client.js';
import {
  listUserIdsWhoCanReadDocument,
  listUserIdsWhoCanWriteContext,
  listUserIdsWhoCanWriteDocument,
} from '../../../notifications/services/notificationRecipients.js';
import { changedUserIdsFromBeforeAfter } from '../route-support/documentRouteSupport.js';

export class UnsupportedScopeWriteGrantError extends Error {}

/** Owner row shape for document context (process / project / subcontext project). */
const documentContextOwnerSelect = {
  ownerUserId: true,
  companyId: true,
  departmentId: true,
  teamId: true,
  team: {
    select: { departmentId: true, department: { select: { companyId: true } } },
  },
} as const;

const listCandidateUsersDocumentSelect = {
  contextId: true,
  context: {
    select: {
      process: { select: { owner: { select: documentContextOwnerSelect } } },
      project: { select: { owner: { select: documentContextOwnerSelect } } },
      subcontext: {
        select: {
          project: { select: { owner: { select: documentContextOwnerSelect } } },
        },
      },
    },
  },
} as const;

async function readWriteUnion(prisma: PrismaClient, documentId: string): Promise<Set<string>> {
  const [readIds, writeIds] = await Promise.all([
    listUserIdsWhoCanReadDocument(prisma, documentId),
    listUserIdsWhoCanWriteDocument(prisma, documentId),
  ]);
  return new Set<string>([...readIds, ...writeIds]);
}

async function grantReplaceChangedUsers(
  prisma: PrismaClient,
  documentId: string,
  before: Set<string>
): Promise<string[]> {
  const [afterRead, afterWrite] = await Promise.all([
    listUserIdsWhoCanReadDocument(prisma, documentId),
    listUserIdsWhoCanWriteDocument(prisma, documentId),
  ]);
  return changedUserIdsFromBeforeAfter({ before, afterRead, afterWrite });
}

export async function getDocumentGrants(prisma: PrismaClient, documentId: string) {
  const [grantUser, grantTeam, grantDepartment] = await Promise.all([
    prisma.documentGrantUser.findMany({
      where: { documentId },
      select: { userId: true, role: true },
    }),
    prisma.documentGrantTeam.findMany({
      where: { documentId },
      select: { teamId: true, role: true },
    }),
    prisma.documentGrantDepartment.findMany({
      where: { documentId },
      select: { departmentId: true, role: true },
    }),
  ]);
  return {
    users: grantUser.map((g) => ({ userId: g.userId, role: g.role })),
    teams: grantTeam.map((g) => ({ teamId: g.teamId, role: g.role })),
    departments: grantDepartment.map((g) => ({ departmentId: g.departmentId, role: g.role })),
  };
}

export async function listCandidateUsersForDocumentGrants(
  prisma: PrismaClient,
  documentId: string
) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: listCandidateUsersDocumentSelect,
  });
  if (!doc) return null;

  const owner =
    doc.context?.process?.owner ??
    doc.context?.project?.owner ??
    doc.context?.subcontext?.project?.owner ??
    null;

  const ownerUserId = owner?.ownerUserId ?? null;
  const ownerCompanyId = owner?.companyId ?? owner?.team?.department?.companyId ?? null;
  const ownerDepartmentId = owner?.departmentId ?? owner?.team?.departmentId ?? null;
  const ownerTeamId = owner?.teamId ?? null;

  const scopeUserIds = new Set<string>();
  if (ownerUserId != null) scopeUserIds.add(ownerUserId);
  if (ownerCompanyId != null) {
    const [members, teamLeads, departmentLeads, companyLeads] = await Promise.all([
      prisma.teamMember.findMany({
        where: { team: { department: { companyId: ownerCompanyId } } },
        select: { userId: true },
      }),
      prisma.teamLead.findMany({
        where: { team: { department: { companyId: ownerCompanyId } } },
        select: { userId: true },
      }),
      prisma.departmentLead.findMany({
        where: { department: { companyId: ownerCompanyId } },
        select: { userId: true },
      }),
      prisma.companyLead.findMany({
        where: { companyId: ownerCompanyId },
        select: { userId: true },
      }),
    ]);
    for (const row of members) scopeUserIds.add(row.userId);
    for (const row of teamLeads) scopeUserIds.add(row.userId);
    for (const row of departmentLeads) scopeUserIds.add(row.userId);
    for (const row of companyLeads) scopeUserIds.add(row.userId);
  } else if (ownerDepartmentId != null) {
    const [members, teamLeads, departmentLeads] = await Promise.all([
      prisma.teamMember.findMany({
        where: { team: { departmentId: ownerDepartmentId } },
        select: { userId: true },
      }),
      prisma.teamLead.findMany({
        where: { team: { departmentId: ownerDepartmentId } },
        select: { userId: true },
      }),
      prisma.departmentLead.findMany({
        where: { departmentId: ownerDepartmentId },
        select: { userId: true },
      }),
    ]);
    for (const row of members) scopeUserIds.add(row.userId);
    for (const row of teamLeads) scopeUserIds.add(row.userId);
    for (const row of departmentLeads) scopeUserIds.add(row.userId);
  } else if (ownerTeamId != null) {
    const [members, teamLeads] = await Promise.all([
      prisma.teamMember.findMany({
        where: { teamId: ownerTeamId },
        select: { userId: true },
      }),
      prisma.teamLead.findMany({
        where: { teamId: ownerTeamId },
        select: { userId: true },
      }),
    ]);
    for (const row of members) scopeUserIds.add(row.userId);
    for (const row of teamLeads) scopeUserIds.add(row.userId);
  }

  const implicitWriterIds =
    doc.contextId != null
      ? await listUserIdsWhoCanWriteContext(prisma, doc.contextId)
      : (
          await prisma.user.findMany({
            where: { isAdmin: true, deletedAt: null },
            select: { id: true },
          })
        ).map((u) => u.id);
  const implicitWriterSet = new Set(implicitWriterIds);
  const candidateIds = [...scopeUserIds].filter((id) => !implicitWriterSet.has(id));
  if (candidateIds.length === 0) return { items: [] };

  const users = await prisma.user.findMany({
    where: { id: { in: candidateIds }, deletedAt: null },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  });
  return {
    items: users.map((u) => ({ id: u.id, name: u.name ?? u.email ?? u.id, email: u.email })),
  };
}

export async function replaceDocumentUserGrants(
  prisma: PrismaClient,
  args: { documentId: string; grants: Array<{ userId: string; role: 'Read' | 'Write' }> }
) {
  const before = await readWriteUnion(prisma, args.documentId);
  await prisma.documentGrantUser.deleteMany({ where: { documentId: args.documentId } });
  if (args.grants.length > 0) {
    await prisma.documentGrantUser.createMany({
      data: args.grants.map((g) => ({
        documentId: args.documentId,
        userId: g.userId,
        role: g.role as GrantRole,
      })),
      skipDuplicates: true,
    });
  }
  const list = await prisma.documentGrantUser.findMany({
    where: { documentId: args.documentId },
    select: { userId: true, role: true },
  });
  return {
    grants: list,
    changedUserIds: await grantReplaceChangedUsers(prisma, args.documentId, before),
  };
}

export async function replaceDocumentTeamGrants(
  prisma: PrismaClient,
  args: { documentId: string; grants: Array<{ teamId: string; role: 'Read' | 'Write' }> }
) {
  if (args.grants.some((g) => g.role === 'Write')) {
    throw new UnsupportedScopeWriteGrantError(
      'Team write grants are not supported. Assign write access to individual users.'
    );
  }
  const before = await readWriteUnion(prisma, args.documentId);
  await prisma.documentGrantTeam.deleteMany({ where: { documentId: args.documentId } });
  if (args.grants.length > 0) {
    await prisma.documentGrantTeam.createMany({
      data: args.grants.map((g) => ({
        documentId: args.documentId,
        teamId: g.teamId,
        role: g.role as GrantRole,
      })),
      skipDuplicates: true,
    });
  }
  const list = await prisma.documentGrantTeam.findMany({
    where: { documentId: args.documentId },
    select: { teamId: true, role: true },
  });
  return {
    grants: list,
    changedUserIds: await grantReplaceChangedUsers(prisma, args.documentId, before),
  };
}

export async function replaceDocumentDepartmentGrants(
  prisma: PrismaClient,
  args: { documentId: string; grants: Array<{ departmentId: string; role: 'Read' | 'Write' }> }
) {
  if (args.grants.some((g) => g.role === 'Write')) {
    throw new UnsupportedScopeWriteGrantError(
      'Department write grants are not supported. Assign write access to individual users.'
    );
  }
  const before = await readWriteUnion(prisma, args.documentId);
  await prisma.documentGrantDepartment.deleteMany({ where: { documentId: args.documentId } });
  if (args.grants.length > 0) {
    await prisma.documentGrantDepartment.createMany({
      data: args.grants.map((g) => ({
        documentId: args.documentId,
        departmentId: g.departmentId,
        role: g.role as GrantRole,
      })),
      skipDuplicates: true,
    });
  }
  const list = await prisma.documentGrantDepartment.findMany({
    where: { documentId: args.documentId },
    select: { departmentId: true, role: true },
  });
  return {
    grants: list,
    changedUserIds: await grantReplaceChangedUsers(prisma, args.documentId, before),
  };
}
