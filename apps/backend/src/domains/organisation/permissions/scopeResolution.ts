import type { PrismaClient } from '../../../../generated/prisma/client.js';

/** Scope reference for company, department, or team (no user/personal). */
export type ScopeRef =
  | { type: 'company'; companyId: string }
  | { type: 'department'; departmentId: string }
  | { type: 'team'; teamId: string };

/**
 * Returns all context IDs that belong to the given scope (process, project, subcontext).
 * No user or permission checks – pure data model / hierarchy.
 */
export async function getContextIdsForScope(
  prisma: PrismaClient,
  scope: ScopeRef
): Promise<string[]> {
  switch (scope.type) {
    case 'company':
      return getCompanyContextIds(prisma, scope.companyId);
    case 'department':
      return getDepartmentContextIds(prisma, scope.departmentId);
    case 'team':
      return getTeamContextIds(prisma, scope.teamId);
    default:
      return [];
  }
}

async function getCompanyContextIds(prisma: PrismaClient, companyId: string): Promise<string[]> {
  const [processContexts, projectContexts] = await Promise.all([
    prisma.process.findMany({
      where: { owner: { companyId } },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { owner: { companyId } },
      select: {
        contextId: true,
        subcontexts: { select: { contextId: true } },
      },
    }),
  ]);
  return [
    ...processContexts.map((p) => p.contextId),
    ...projectContexts.flatMap((p) => [p.contextId, ...p.subcontexts.map((s) => s.contextId)]),
  ];
}

async function getDepartmentContextIds(
  prisma: PrismaClient,
  departmentId: string
): Promise<string[]> {
  const teamIds = await prisma.team.findMany({
    where: { departmentId },
    select: { id: true },
  });
  const teamIdList = teamIds.map((t) => t.id);
  const [deptProcessContexts, deptProjectContexts, teamProcessContexts, teamProjectContexts] =
    await Promise.all([
      prisma.process.findMany({
        where: { owner: { departmentId } },
        select: { contextId: true },
      }),
      prisma.project.findMany({
        where: { owner: { departmentId } },
        select: {
          contextId: true,
          subcontexts: { select: { contextId: true } },
        },
      }),
      teamIdList.length > 0
        ? prisma.process.findMany({
            where: { owner: { teamId: { in: teamIdList } } },
            select: { contextId: true },
          })
        : Promise.resolve([]),
      teamIdList.length > 0
        ? prisma.project.findMany({
            where: { owner: { teamId: { in: teamIdList } } },
            select: {
              contextId: true,
              subcontexts: { select: { contextId: true } },
            },
          })
        : Promise.resolve([]),
    ]);
  return [
    ...deptProcessContexts.map((p) => p.contextId),
    ...deptProjectContexts.flatMap((p) => [p.contextId, ...p.subcontexts.map((s) => s.contextId)]),
    ...teamProcessContexts.map((p) => p.contextId),
    ...teamProjectContexts.flatMap((p) => [p.contextId, ...p.subcontexts.map((s) => s.contextId)]),
  ];
}

async function getTeamContextIds(prisma: PrismaClient, teamId: string): Promise<string[]> {
  const [processContexts, projectContexts] = await Promise.all([
    prisma.process.findMany({
      where: { owner: { teamId } },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { owner: { teamId } },
      select: {
        contextId: true,
        subcontexts: { select: { contextId: true } },
      },
    }),
  ]);
  return [
    ...processContexts.map((p) => p.contextId),
    ...projectContexts.flatMap((p) => [p.contextId, ...p.subcontexts.map((s) => s.contextId)]),
  ];
}
