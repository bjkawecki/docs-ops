import type { PrismaClient } from '../../generated/prisma/client.js';
import { GrantRole } from '../../generated/prisma/client.js';
import { loadUser } from './canRead.js';

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

  const companyIds = user.companyLeads.map((c) => c.companyId);
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
        where: { deletedAt: null },
        select: { contextId: true },
      }),
      prisma.project.findMany({
        where: { deletedAt: null },
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
      where: { deletedAt: null, owner: { ownerUserId: userId } },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, owner: { ownerUserId: userId } },
      select: { contextId: true },
    }),
    prisma.subcontext.findMany({
      where: { project: { owner: { ownerUserId: userId } } },
      select: { contextId: true },
    }),
    ownerOrConditions.length > 0
      ? prisma.process.findMany({
          where: { deletedAt: null, owner: { OR: ownerOrConditions } },
          select: { contextId: true },
        })
      : Promise.resolve([]),
    ownerOrConditions.length > 0
      ? prisma.project.findMany({
          where: { deletedAt: null, owner: { OR: ownerOrConditions } },
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
