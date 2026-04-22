import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { GrantRole } from '../../../../generated/prisma/client.js';
import { loadUser } from '../../documents/permissions/canRead.js';

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

  const companyIds = [
    ...user.companyLeads.map((c) => c.companyId),
    ...user.departmentLeads.map((d) => d.department.companyId),
    ...user.teamMemberships.map((m) => m.team.department.companyId),
    ...user.leadOfTeams.map((l) => l.team.department.companyId),
  ].filter((id): id is string => id != null);
  const departmentIds = [
    ...user.departmentLeads.map((d) => d.departmentId),
    ...user.teamMemberships.map((m) => m.team.departmentId),
    ...user.leadOfTeams.map((l) => l.team.departmentId),
  ].filter((id): id is string => id != null);
  const teamIds = user.teamMemberships.map((m) => m.team.id);
  const uniqueDepartmentIds = [...new Set(departmentIds)];

  if (user.isAdmin) {
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
    const contextIds = [
      ...processes.map((p) => p.contextId),
      ...projects.map((p) => p.contextId),
      ...subcontexts.map((s) => s.contextId),
    ];
    return { contextIds, documentIdsFromGrants: [] };
  }

  const ownerOrConditions = [
    ...(companyIds.length > 0 ? [{ companyId: { in: companyIds } }] : []),
    ...(uniqueDepartmentIds.length > 0 ? [{ departmentId: { in: uniqueDepartmentIds } }] : []),
    ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
  ];

  const [
    personalProcessContexts,
    personalProjectContexts,
    personalSubcontextContexts,
    processContexts,
    projectContexts,
    subcontextContexts,
    grantUserDocs,
    grantTeamDocs,
    grantDeptDocs,
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
    prisma.documentGrantUser.findMany({
      where: { userId, role: GrantRole.Read },
      select: { documentId: true },
    }),
    prisma.documentGrantTeam.findMany({
      where: { role: GrantRole.Read, teamId: { in: teamIds } },
      select: { documentId: true },
    }),
    prisma.documentGrantDepartment.findMany({
      where: { role: GrantRole.Read, departmentId: { in: uniqueDepartmentIds } },
      select: { documentId: true },
    }),
  ]);

  const contextIds = [
    ...personalProcessContexts.map((p) => p.contextId),
    ...personalProjectContexts.map((p) => p.contextId),
    ...personalSubcontextContexts.map((s) => s.contextId),
    ...processContexts.map((p) => p.contextId),
    ...projectContexts.map((p) => p.contextId),
    ...subcontextContexts.map((s) => s.contextId),
  ];
  const documentIdsFromGrants = [
    ...new Set([
      ...grantUserDocs.map((g) => g.documentId),
      ...grantTeamDocs.map((g) => g.documentId),
      ...grantDeptDocs.map((g) => g.documentId),
    ]),
  ];

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

  const companyIds = [
    ...user.companyLeads.map((c) => c.companyId),
    ...user.departmentLeads.map((d) => d.department.companyId),
    ...user.teamMemberships.map((m) => m.team.department.companyId),
    ...user.leadOfTeams.map((l) => l.team.department.companyId),
  ].filter((id): id is string => id != null);
  const departmentIdsFromLeads = user.departmentLeads.map((d) => d.departmentId);
  const teamIdsFromLeads = user.leadOfTeams.map((l) => l.teamId);
  const departmentIdsFromTeams = [
    ...user.teamMemberships.map((m) => m.team.departmentId),
    ...user.leadOfTeams.map((l) => l.team.departmentId),
  ].filter((id): id is string => id != null);
  const uniqueDepartmentIdsForGrants = [
    ...new Set([...departmentIdsFromLeads, ...departmentIdsFromTeams]),
  ];
  const teamIdsForGrants = [
    ...user.teamMemberships.map((m) => m.team.id),
    ...user.leadOfTeams.map((l) => l.teamId),
  ];

  if (user.isAdmin) {
    const [processes, projects, subcontexts, contextFreeDrafts] = await Promise.all([
      prisma.process.findMany({
        where: { deletedAt: null, archivedAt: null },
        select: { contextId: true },
      }),
      prisma.project.findMany({
        where: { deletedAt: null, archivedAt: null },
        select: { contextId: true },
      }),
      prisma.subcontext.findMany({ select: { contextId: true } }),
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
    const contextIds = [
      ...processes.map((p) => p.contextId),
      ...projects.map((p) => p.contextId),
      ...subcontexts.map((s) => s.contextId),
    ];
    const documentIdsFromGrants = await getDocumentIdsWithWriteGrants(
      prisma,
      userId,
      teamIdsForGrants,
      uniqueDepartmentIdsForGrants
    );
    const documentIdsFromCreator = contextFreeDrafts.map((d) => d.id);
    return { contextIds, documentIdsFromGrants, documentIdsFromCreator };
  }

  const ownerOrConditions = [
    ...(companyIds.length > 0 ? [{ companyId: { in: companyIds } }] : []),
    ...(departmentIdsFromLeads.length > 0
      ? [{ departmentId: { in: departmentIdsFromLeads } }]
      : []),
    ...(teamIdsFromLeads.length > 0 ? [{ teamId: { in: teamIdsFromLeads } }] : []),
  ];

  const [
    personalProcessContexts,
    personalProjectContexts,
    personalSubcontextContexts,
    processContexts,
    projectContexts,
    subcontextContexts,
    grantUserDocs,
    grantTeamDocs,
    grantDeptDocs,
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
    prisma.documentGrantUser.findMany({
      where: { userId, role: GrantRole.Write },
      select: { documentId: true },
    }),
    prisma.documentGrantTeam.findMany({
      where: { role: GrantRole.Write, teamId: { in: teamIdsForGrants } },
      select: { documentId: true },
    }),
    prisma.documentGrantDepartment.findMany({
      where: { role: GrantRole.Write, departmentId: { in: uniqueDepartmentIdsForGrants } },
      select: { documentId: true },
    }),
  ]);

  const contextIds = [
    ...personalProcessContexts.map((p) => p.contextId),
    ...personalProjectContexts.map((p) => p.contextId),
    ...personalSubcontextContexts.map((s) => s.contextId),
    ...processContexts.map((p) => p.contextId),
    ...projectContexts.map((p) => p.contextId),
    ...subcontextContexts.map((s) => s.contextId),
  ];
  const documentIdsFromGrants = [
    ...new Set([
      ...grantUserDocs.map((g) => g.documentId),
      ...grantTeamDocs.map((g) => g.documentId),
      ...grantDeptDocs.map((g) => g.documentId),
    ]),
  ];

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

async function getDocumentIdsWithWriteGrants(
  prisma: PrismaClient,
  userId: string,
  teamIds: string[],
  departmentIds: string[]
): Promise<string[]> {
  const [userDocs, teamDocs, deptDocs] = await Promise.all([
    prisma.documentGrantUser.findMany({
      where: { userId, role: GrantRole.Write },
      select: { documentId: true },
    }),
    teamIds.length > 0
      ? prisma.documentGrantTeam.findMany({
          where: { role: GrantRole.Write, teamId: { in: teamIds } },
          select: { documentId: true },
        })
      : Promise.resolve([]),
    departmentIds.length > 0
      ? prisma.documentGrantDepartment.findMany({
          where: { role: GrantRole.Write, departmentId: { in: departmentIds } },
          select: { documentId: true },
        })
      : Promise.resolve([]),
  ]);
  return [
    ...new Set([
      ...userDocs.map((g) => g.documentId),
      ...teamDocs.map((g) => g.documentId),
      ...deptDocs.map((g) => g.documentId),
    ]),
  ];
}
