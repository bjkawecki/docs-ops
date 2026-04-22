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

const processContextIdSelect = { contextId: true } as const;

const projectContextIdsWithSubcontextsSelect = {
  contextId: true,
  subcontexts: { select: { contextId: true } },
} as const;

function flattenProcessAndProjectContextIds(
  processContexts: Array<{ contextId: string }>,
  projectContexts: Array<{
    contextId: string;
    subcontexts: Array<{ contextId: string }>;
  }>
): string[] {
  return [
    ...processContexts.map((p) => p.contextId),
    ...projectContexts.flatMap((p) => [p.contextId, ...p.subcontexts.map((s) => s.contextId)]),
  ];
}

async function getCompanyContextIds(prisma: PrismaClient, companyId: string): Promise<string[]> {
  const [processContexts, projectContexts] = await Promise.all([
    prisma.process.findMany({
      where: { owner: { companyId } },
      select: processContextIdSelect,
    }),
    prisma.project.findMany({
      where: { owner: { companyId } },
      select: projectContextIdsWithSubcontextsSelect,
    }),
  ]);
  return flattenProcessAndProjectContextIds(processContexts, projectContexts);
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
        select: processContextIdSelect,
      }),
      prisma.project.findMany({
        where: { owner: { departmentId } },
        select: projectContextIdsWithSubcontextsSelect,
      }),
      teamIdList.length > 0
        ? prisma.process.findMany({
            where: { owner: { teamId: { in: teamIdList } } },
            select: processContextIdSelect,
          })
        : Promise.resolve([]),
      teamIdList.length > 0
        ? prisma.project.findMany({
            where: { owner: { teamId: { in: teamIdList } } },
            select: projectContextIdsWithSubcontextsSelect,
          })
        : Promise.resolve([]),
    ]);
  return [
    ...flattenProcessAndProjectContextIds(deptProcessContexts, deptProjectContexts),
    ...flattenProcessAndProjectContextIds(teamProcessContexts, teamProjectContexts),
  ];
}

async function getTeamContextIds(prisma: PrismaClient, teamId: string): Promise<string[]> {
  const [processContexts, projectContexts] = await Promise.all([
    prisma.process.findMany({
      where: { owner: { teamId } },
      select: processContextIdSelect,
    }),
    prisma.project.findMany({
      where: { owner: { teamId } },
      select: projectContextIdsWithSubcontextsSelect,
    }),
  ]);
  return flattenProcessAndProjectContextIds(processContexts, projectContexts);
}
