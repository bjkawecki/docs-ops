import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAdminPreHandler, requireAuthPreHandler } from '../../auth/middleware.js';
import {
  companyIdParamSchema,
  departmentIdParamSchema,
  teamIdParamSchema,
} from '../../organisation/schemas/organisation.js';
import type { PrismaClient } from '../../../../generated/prisma/client.js';

async function distinctUserIdsFromTeamMembers(
  prisma: PrismaClient,
  teamIds: string[]
): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: teamIds } },
    select: { userId: true },
  });
  return [...new Set(members.map((m) => m.userId))];
}

async function getOwnerScopeDocumentAndContextCounts(
  prisma: PrismaClient,
  ownerIds: string[]
): Promise<{ documentCount: number; processCount: number; projectCount: number }> {
  if (ownerIds.length === 0) {
    return { documentCount: 0, processCount: 0, projectCount: 0 };
  }
  const [processes, projects, processCount, projectCount] = await Promise.all([
    prisma.process.findMany({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
      select: { id: true, contextId: true },
    }),
    prisma.process.count({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
    }),
    prisma.project.count({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
    }),
  ]);
  const projectIds = projects.map((p) => p.id);
  const subcontexts =
    projectIds.length > 0
      ? await prisma.subcontext.findMany({
          where: { projectId: { in: projectIds } },
          select: { contextId: true },
        })
      : [];
  const contextIds = [
    ...processes.map((p) => p.contextId),
    ...projects.map((p) => p.contextId),
    ...subcontexts.map((s) => s.contextId),
  ];
  const documentCount =
    contextIds.length > 0
      ? await prisma.document.count({
          where: { contextId: { in: contextIds }, deletedAt: null },
        })
      : 0;
  return {
    documentCount,
    processCount,
    projectCount,
  };
}

const adminOrganisationRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  const preAdmin = [requireAuthPreHandler, requireAdminPreHandler];

  /** GET /api/v1/admin/companies/:companyId/stats – Kennzahlen für Company (Storage, Departments, Teams, Members, Documents, Processes, Projects). */
  app.get<{ Params: { companyId: string } }>(
    '/admin/companies/:companyId/stats',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const prisma = request.server.prisma;
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!company) {
        return reply.status(404).send({ error: 'Company not found.' });
      }
      const departments = await prisma.department.findMany({
        where: { companyId },
        select: { id: true },
      });
      const departmentIds = departments.map((d) => d.id);
      const teams = await prisma.team.findMany({
        where: { departmentId: { in: departmentIds } },
        select: { id: true },
      });
      const teamIds = teams.map((t) => t.id);
      const userIds = await distinctUserIdsFromTeamMembers(prisma, teamIds);
      const owners = await prisma.owner.findMany({
        where: { companyId },
        select: { id: true },
      });
      const ownerIds = owners.map((o) => o.id);
      const [storageResult, departmentCount, scopeCounts] = await Promise.all([
        userIds.length > 0
          ? prisma.documentAttachment.aggregate({
              where: { uploadedById: { in: userIds } },
              _sum: { sizeBytes: true },
            })
          : Promise.resolve({ _sum: { sizeBytes: null as number | null } }),
        prisma.department.count({ where: { companyId } }),
        getOwnerScopeDocumentAndContextCounts(prisma, ownerIds),
      ]);
      return reply.send({
        storageBytesUsed: storageResult._sum.sizeBytes ?? 0,
        departmentCount,
        teamCount: teams.length,
        memberCount: userIds.length,
        documentCount: scopeCounts.documentCount,
        processCount: scopeCounts.processCount,
        projectCount: scopeCounts.projectCount,
      });
    }
  );

  /** GET /api/v1/admin/departments/:departmentId/stats – Kennzahlen für Department (Storage, Teams, Members, Documents, Processes, Projects). */
  app.get<{ Params: { departmentId: string } }>(
    '/admin/departments/:departmentId/stats',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const prisma = request.server.prisma;
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true },
      });
      if (!department) {
        return reply.status(404).send({ error: 'Department not found.' });
      }
      const teams = await prisma.team.findMany({
        where: { departmentId },
        select: { id: true },
      });
      const teamIds = teams.map((t) => t.id);
      const userIds = await distinctUserIdsFromTeamMembers(prisma, teamIds);
      const owners = await prisma.owner.findMany({
        where: { departmentId },
        select: { id: true },
      });
      const ownerIds = owners.map((o) => o.id);
      const [storageResult, teamCount, memberCount, scopeCounts] = await Promise.all([
        userIds.length > 0
          ? prisma.documentAttachment.aggregate({
              where: { uploadedById: { in: userIds } },
              _sum: { sizeBytes: true },
            })
          : Promise.resolve({ _sum: { sizeBytes: null as number | null } }),
        prisma.team.count({ where: { departmentId } }),
        Promise.resolve(userIds.length),
        getOwnerScopeDocumentAndContextCounts(prisma, ownerIds),
      ]);
      return reply.send({
        storageBytesUsed: storageResult._sum.sizeBytes ?? 0,
        teamCount,
        memberCount,
        documentCount: scopeCounts.documentCount,
        processCount: scopeCounts.processCount,
        projectCount: scopeCounts.projectCount,
      });
    }
  );

  /** GET /api/v1/admin/teams/:teamId/members – Mitgliederliste (Admin, ohne canViewTeam). */
  app.get<{
    Params: { teamId: string };
    Querystring: { limit?: number | string; offset?: number | string };
  }>('/admin/teams/:teamId/members', { preHandler: preAdmin }, async (request, reply) => {
    const { teamId } = teamIdParamSchema.parse(request.params);
    const limit = Math.min(Number(request.query?.limit) || 500, 500);
    const offset = Math.max(0, Number(request.query?.offset) || 0);
    const team = await request.server.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) {
      return reply.status(404).send({ error: 'Team not found.' });
    }
    const [items, total] = await Promise.all([
      request.server.prisma.teamMember.findMany({
        where: { teamId },
        include: { user: { select: { id: true, name: true } } },
        take: limit,
        skip: offset,
        orderBy: { userId: 'asc' },
      }),
      request.server.prisma.teamMember.count({ where: { teamId } }),
    ]);
    const list = items.map((m) => ({ id: m.user.id, name: m.user.name }));
    return reply.send({ items: list, total, limit, offset });
  });

  /** GET /api/v1/admin/teams/:teamId/stats – Kennzahlen für Team (Storage, Members, Documents, Processes, Projects). */
  app.get<{ Params: { teamId: string } }>(
    '/admin/teams/:teamId/stats',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const prisma = request.server.prisma;
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (!team) {
        return reply.status(404).send({ error: 'Team not found.' });
      }
      const members = await prisma.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      });
      const userIds = members.map((m) => m.userId);
      const owners = await prisma.owner.findMany({
        where: { teamId },
        select: { id: true },
      });
      const ownerIds = owners.map((o) => o.id);
      const [storageResult, memberCount, scopeCounts] = await Promise.all([
        userIds.length > 0
          ? prisma.documentAttachment.aggregate({
              where: { uploadedById: { in: userIds } },
              _sum: { sizeBytes: true },
            })
          : Promise.resolve({ _sum: { sizeBytes: null as number | null } }),
        prisma.teamMember.count({ where: { teamId } }),
        getOwnerScopeDocumentAndContextCounts(prisma, ownerIds),
      ]);
      return reply.send({
        storageBytesUsed: storageResult._sum.sizeBytes ?? 0,
        memberCount,
        documentCount: scopeCounts.documentCount,
        processCount: scopeCounts.processCount,
        projectCount: scopeCounts.projectCount,
      });
    }
  );

  /** GET /api/v1/admin/departments/member-counts – Pro Department Anzahl verschiedener User (in allen Teams). */
  app.get('/admin/departments/member-counts', { preHandler: preAdmin }, async (request, reply) => {
    const rawIds = (request.query as { ids?: string }).ids;
    const departmentIds =
      typeof rawIds === 'string' && rawIds.trim()
        ? rawIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null;
    const teamMembers = await request.server.prisma.teamMember.findMany({
      where: departmentIds ? { team: { departmentId: { in: departmentIds } } } : undefined,
      select: { userId: true, team: { select: { departmentId: true } } },
    });
    const byDept = new Map<string, Set<string>>();
    for (const m of teamMembers) {
      const deptId = m.team.departmentId;
      if (!byDept.has(deptId)) byDept.set(deptId, new Set());
      byDept.get(deptId)!.add(m.userId);
    }
    const result: Record<string, number> = {};
    for (const [deptId, userIds] of byDept) {
      result[deptId] = userIds.size;
    }
    return reply.send(result);
  });

  return Promise.resolve();
};

export default adminOrganisationRoutes;
