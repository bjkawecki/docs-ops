import type { Prisma, PrismaClient } from '../../../../generated/prisma/client.js';
import { GrantRole } from '../../../../generated/prisma/client.js';
import { loadUser } from '../../documents/permissions/canRead.js';

type LoadedUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;
type ContextIdRow = { contextId: string };
type DocumentIdRow = { documentId: string };

function uniqueStrings(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => id != null))];
}

function mergeContextIds(...groups: ContextIdRow[][]): string[] {
  return groups.flatMap((group) => group.map((row) => row.contextId));
}

function mergeDocumentIds(...groups: DocumentIdRow[][]): string[] {
  return [...new Set(groups.flatMap((group) => group.map((row) => row.documentId)))];
}

function getCompanyIds(user: LoadedUser): string[] {
  return uniqueStrings([
    ...user.companyLeads.map((c) => c.companyId),
    ...user.departmentLeads.map((d) => d.department.companyId),
    ...user.teamMemberships.map((m) => m.team.department.companyId),
    ...user.leadOfTeams.map((l) => l.team.department.companyId),
  ]);
}

function buildOwnerOrConditions(
  companyIds: string[],
  departmentIds: string[],
  teamIds: string[]
): Prisma.OwnerWhereInput[] {
  return [
    ...(companyIds.length > 0 ? [{ companyId: { in: companyIds } }] : []),
    ...(departmentIds.length > 0 ? [{ departmentId: { in: departmentIds } }] : []),
    ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
  ];
}

async function loadAllActiveContextIds(prisma: PrismaClient): Promise<string[]> {
  const [processes, projects, subcontexts] = await Promise.all([
    prisma.process.findMany({
      where: { deletedAt: null, archivedAt: null },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, archivedAt: null },
      select: { contextId: true },
    }),
    prisma.subcontext.findMany({ select: { contextId: true } }),
  ]);
  return mergeContextIds(processes, projects, subcontexts);
}

async function loadScopedContextIds(
  prisma: PrismaClient,
  userId: string,
  ownerOrConditions: Prisma.OwnerWhereInput[]
): Promise<string[]> {
  const [
    personalProcessContexts,
    personalProjectContexts,
    personalSubcontextContexts,
    processContexts,
    projectContexts,
    subcontextContexts,
  ] = await Promise.all([
    prisma.process.findMany({
      where: { deletedAt: null, archivedAt: null, owner: { ownerUserId: userId } },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, archivedAt: null, owner: { ownerUserId: userId } },
      select: { contextId: true },
    }),
    prisma.subcontext.findMany({
      where: { project: { owner: { ownerUserId: userId } } },
      select: { contextId: true },
    }),
    ownerOrConditions.length > 0
      ? prisma.process.findMany({
          where: { deletedAt: null, archivedAt: null, owner: { OR: ownerOrConditions } },
          select: { contextId: true },
        })
      : Promise.resolve([]),
    ownerOrConditions.length > 0
      ? prisma.project.findMany({
          where: { deletedAt: null, archivedAt: null, owner: { OR: ownerOrConditions } },
          select: { contextId: true },
        })
      : Promise.resolve([]),
    ownerOrConditions.length > 0
      ? prisma.subcontext.findMany({
          where: { project: { owner: { OR: ownerOrConditions } } },
          select: { contextId: true },
        })
      : Promise.resolve([]),
  ]);

  return mergeContextIds(
    personalProcessContexts,
    personalProjectContexts,
    personalSubcontextContexts,
    processContexts,
    projectContexts,
    subcontextContexts
  );
}

async function getDocumentIdsWithGrantsByRole(
  prisma: PrismaClient,
  args: {
    role: GrantRole;
    userId: string;
    teamIds: string[];
    departmentIds: string[];
  }
): Promise<string[]> {
  const [userDocs, teamDocs, deptDocs] = await Promise.all([
    prisma.documentGrantUser.findMany({
      where: { userId: args.userId, role: args.role },
      select: { documentId: true },
    }),
    args.teamIds.length > 0
      ? prisma.documentGrantTeam.findMany({
          where: { role: args.role, teamId: { in: args.teamIds } },
          select: { documentId: true },
        })
      : Promise.resolve([]),
    args.departmentIds.length > 0
      ? prisma.documentGrantDepartment.findMany({
          where: { role: args.role, departmentId: { in: args.departmentIds } },
          select: { documentId: true },
        })
      : Promise.resolve([]),
  ]);
  return mergeDocumentIds(userDocs, teamDocs, deptDocs);
}

/**
 * Returns context IDs the user can read (via context ownership) and document IDs
 * the user can read via explicit grants only. Used for catalog document listing.
 */
export async function getReadableCatalogScope(
  prisma: PrismaClient,
  userId: string
): Promise<{ contextIds: string[]; documentIdsFromGrants: string[] }> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) {
    return { contextIds: [], documentIdsFromGrants: [] };
  }

  const companyIds = getCompanyIds(user);
  const departmentIds = uniqueStrings([
    ...user.departmentLeads.map((d) => d.departmentId),
    ...user.teamMemberships.map((m) => m.team.departmentId),
    ...user.leadOfTeams.map((l) => l.team.departmentId),
  ]);
  const teamIds = user.teamMemberships.map((m) => m.team.id);
  const uniqueDepartmentIds = uniqueStrings(departmentIds);

  if (user.isAdmin) {
    const contextIds = await loadAllActiveContextIds(prisma);
    return { contextIds, documentIdsFromGrants: [] };
  }

  const ownerOrConditions = buildOwnerOrConditions(companyIds, uniqueDepartmentIds, teamIds);
  const [contextIds, documentIdsFromGrants] = await Promise.all([
    loadScopedContextIds(prisma, userId, ownerOrConditions),
    getDocumentIdsWithGrantsByRole(prisma, {
      role: GrantRole.Read,
      userId,
      teamIds,
      departmentIds: uniqueDepartmentIds,
    }),
  ]);

  return { contextIds, documentIdsFromGrants };
}

/**
 * Returns unique owner IDs for the given context IDs (process, project, or subcontext owner).
 */
export async function getOwnerIdsForContextIds(
  prisma: PrismaClient,
  contextIds: string[]
): Promise<string[]> {
  if (contextIds.length === 0) return [];
  const [processes, projects, subcontexts] = await Promise.all([
    prisma.process.findMany({
      where: { contextId: { in: contextIds } },
      select: { ownerId: true },
    }),
    prisma.project.findMany({
      where: { contextId: { in: contextIds } },
      select: { ownerId: true },
    }),
    prisma.subcontext.findMany({
      where: { contextId: { in: contextIds } },
      select: { project: { select: { ownerId: true } } },
    }),
  ]);
  const ownerIds = [
    ...processes.map((p) => p.ownerId),
    ...projects.map((p) => p.ownerId),
    ...subcontexts.map((s) => s.project.ownerId),
  ];
  return [...new Set(ownerIds)];
}

/**
 * Returns owner IDs for all scopes the user can read in the catalog (contexts + document-grant contexts).
 * Used to load "all catalog tags" for the catalog filter.
 */
export async function getReadableCatalogOwnerIds(
  prisma: PrismaClient,
  userId: string
): Promise<string[]> {
  const scope = await getReadableCatalogScope(prisma, userId);
  let allContextIds = [...scope.contextIds];
  if (scope.documentIdsFromGrants.length > 0) {
    const docs = await prisma.document.findMany({
      where: { id: { in: scope.documentIdsFromGrants } },
      select: { contextId: true },
    });
    const grantContextIds = docs.map((d) => d.contextId).filter((id): id is string => id != null);
    allContextIds = [...new Set([...allContextIds, ...grantContextIds])];
  }
  return getOwnerIdsForContextIds(prisma, allContextIds);
}

/**
 * Returns context IDs where the user can write (scope lead: canWriteContext), document IDs
 * with explicit Write grant, and document IDs of context-free drafts created by the user.
 * Used to determine draft visibility in the catalog.
 */
export async function getWritableCatalogScope(
  prisma: PrismaClient,
  userId: string
): Promise<{
  contextIds: string[];
  documentIdsFromGrants: string[];
  documentIdsFromCreator: string[];
}> {
  const user = await loadUser(prisma, userId);
  if (!user || user.deletedAt !== null) {
    return { contextIds: [], documentIdsFromGrants: [], documentIdsFromCreator: [] };
  }

  const companyIds = getCompanyIds(user);
  const departmentIdsFromLeads = user.departmentLeads.map((d) => d.departmentId);
  const teamIdsFromLeads = user.leadOfTeams.map((l) => l.teamId);
  const departmentIdsFromTeams = uniqueStrings([
    ...user.teamMemberships.map((m) => m.team.departmentId),
    ...user.leadOfTeams.map((l) => l.team.departmentId),
  ]);
  const uniqueDepartmentIdsForGrants = uniqueStrings([
    ...departmentIdsFromLeads,
    ...departmentIdsFromTeams,
  ]);
  const teamIdsForGrants = [
    ...user.teamMemberships.map((m) => m.team.id),
    ...user.leadOfTeams.map((l) => l.teamId),
  ];

  if (user.isAdmin) {
    const [contextIds, contextFreeDrafts] = await Promise.all([
      loadAllActiveContextIds(prisma),
      prisma.document.findMany({
        where: {
          contextId: null,
          publishedAt: null,
          deletedAt: null,
          archivedAt: null,
          createdById: userId,
        },
        select: { id: true },
      }),
    ]);
    const documentIdsFromGrants = await getDocumentIdsWithGrantsByRole(prisma, {
      role: GrantRole.Write,
      userId,
      teamIds: teamIdsForGrants,
      departmentIds: uniqueDepartmentIdsForGrants,
    });
    const documentIdsFromCreator = contextFreeDrafts.map((d) => d.id);
    return { contextIds, documentIdsFromGrants, documentIdsFromCreator };
  }

  const ownerOrConditions = buildOwnerOrConditions(
    companyIds,
    departmentIdsFromLeads,
    teamIdsFromLeads
  );
  const [contextIds, documentIdsFromGrants] = await Promise.all([
    loadScopedContextIds(prisma, userId, ownerOrConditions),
    getDocumentIdsWithGrantsByRole(prisma, {
      role: GrantRole.Write,
      userId,
      teamIds: teamIdsForGrants,
      departmentIds: uniqueDepartmentIdsForGrants,
    }),
  ]);

  const contextFreeDrafts = await prisma.document.findMany({
    where: {
      contextId: null,
      publishedAt: null,
      deletedAt: null,
      archivedAt: null,
      createdById: userId,
    },
    select: { id: true },
  });
  const documentIdsFromCreator = contextFreeDrafts.map((d) => d.id);

  return { contextIds, documentIdsFromGrants, documentIdsFromCreator };
}
