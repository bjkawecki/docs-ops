import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import {
  canManageTeamMembers,
  canManageTeamLeaders,
  canViewTeam,
  canViewDepartment,
} from '../permissions/index.js';
import {
  assignmentListQuerySchema,
  teamIdParamSchema,
  departmentIdParamSchema,
  teamIdUserIdParamSchema,
  departmentIdUserIdParamSchema,
  addAssignmentBodySchema,
} from './schemas/assignments.js';

const assignmentsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // --- Team-Mitglieder ---
  app.get('/teams/:teamId/members', { preHandler: requireAuth }, async (request, reply) => {
    const { teamId } = teamIdParamSchema.parse(request.params);
    const query = assignmentListQuerySchema.parse(request.query);
    const userId = (request as { user?: { id: string } }).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });

    const allowed = await canViewTeam(request.server.prisma, userId, teamId);
    if (!allowed) return reply.status(403).send({ error: 'Kein Zugriff auf dieses Team' });

    const [items, total] = await Promise.all([
      request.server.prisma.teamMember.findMany({
        where: { teamId },
        include: { user: { select: { id: true, name: true } } },
        take: query.limit,
        skip: query.offset,
        orderBy: { userId: 'asc' },
      }),
      request.server.prisma.teamMember.count({ where: { teamId } }),
    ]);
    const list = items.map((m) => ({ id: m.user.id, name: m.user.name }));
    return reply.send({ items: list, total, limit: query.limit, offset: query.offset });
  });

  app.post('/teams/:teamId/members', { preHandler: requireAuth }, async (request, reply) => {
    const { teamId } = teamIdParamSchema.parse(request.params);
    const body = addAssignmentBodySchema.parse(request.body);
    const userId = (request as { user?: { id: string } }).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });

    const allowed = await canManageTeamMembers(request.server.prisma, userId, teamId);
    if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung' });

    const team = await request.server.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return reply.status(404).send({ error: 'Team nicht gefunden' });
    const user = await request.server.prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return reply.status(404).send({ error: 'User nicht gefunden' });

    const existing = await request.server.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: body.userId } },
    });
    if (existing) return reply.status(409).send({ error: 'User ist bereits Mitglied' });

    await request.server.prisma.teamMember.create({
      data: { teamId, userId: body.userId },
    });
    return reply.status(201).send({ teamId, userId: body.userId });
  });

  app.delete(
    '/teams/:teamId/members/:userId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { teamId, userId: targetUserId } = teamIdUserIdParamSchema.parse(request.params);
      const userId = (request as { user?: { id: string } }).user?.id;
      if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });

      const allowed = await canManageTeamMembers(request.server.prisma, userId, teamId);
      if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung' });

      const existing = await request.server.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: targetUserId } },
      });
      if (!existing) return reply.status(404).send({ error: 'Mitgliedschaft nicht gefunden' });

      await request.server.prisma.teamMember.delete({
        where: { teamId_userId: { teamId, userId: targetUserId } },
      });
      return reply.status(204).send();
    }
  );

  // --- Team-Leader ---
  app.get('/teams/:teamId/leaders', { preHandler: requireAuth }, async (request, reply) => {
    const { teamId } = teamIdParamSchema.parse(request.params);
    const query = assignmentListQuerySchema.parse(request.query);
    const userId = (request as { user?: { id: string } }).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });

    const allowed = await canViewTeam(request.server.prisma, userId, teamId);
    if (!allowed) return reply.status(403).send({ error: 'Kein Zugriff auf dieses Team' });

    const [items, total] = await Promise.all([
      request.server.prisma.teamLeader.findMany({
        where: { teamId },
        include: { user: { select: { id: true, name: true } } },
        take: query.limit,
        skip: query.offset,
        orderBy: { userId: 'asc' },
      }),
      request.server.prisma.teamLeader.count({ where: { teamId } }),
    ]);
    const list = items.map((l) => ({ id: l.user.id, name: l.user.name }));
    return reply.send({ items: list, total, limit: query.limit, offset: query.offset });
  });

  app.post('/teams/:teamId/leaders', { preHandler: requireAuth }, async (request, reply) => {
    const { teamId } = teamIdParamSchema.parse(request.params);
    const body = addAssignmentBodySchema.parse(request.body);
    const userId = (request as { user?: { id: string } }).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });

    const allowed = await canManageTeamLeaders(request.server.prisma, userId, teamId);
    if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung' });

    const team = await request.server.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return reply.status(404).send({ error: 'Team nicht gefunden' });
    const user = await request.server.prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return reply.status(404).send({ error: 'User nicht gefunden' });

    const existing = await request.server.prisma.teamLeader.findUnique({
      where: { teamId_userId: { teamId, userId: body.userId } },
    });
    if (existing) return reply.status(409).send({ error: 'User ist bereits Leader' });

    await request.server.prisma.teamLeader.create({
      data: { teamId, userId: body.userId },
    });
    return reply.status(201).send({ teamId, userId: body.userId });
  });

  app.delete(
    '/teams/:teamId/leaders/:userId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { teamId, userId: targetUserId } = teamIdUserIdParamSchema.parse(request.params);
      const userId = (request as { user?: { id: string } }).user?.id;
      if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });

      const allowed = await canManageTeamLeaders(request.server.prisma, userId, teamId);
      if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung' });

      const existing = await request.server.prisma.teamLeader.findUnique({
        where: { teamId_userId: { teamId, userId: targetUserId } },
      });
      if (!existing) return reply.status(404).send({ error: 'Leader-Zuordnung nicht gefunden' });

      await request.server.prisma.teamLeader.delete({
        where: { teamId_userId: { teamId, userId: targetUserId } },
      });
      return reply.status(204).send();
    }
  );

  // --- Supervisor (Abteilung) ---
  app.get(
    '/departments/:departmentId/supervisors',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const query = assignmentListQuerySchema.parse(request.query);
      const userId = (request as { user?: { id: string } }).user?.id;
      if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });

      const allowed = await canViewDepartment(request.server.prisma, userId, departmentId);
      if (!allowed) return reply.status(403).send({ error: 'Kein Zugriff auf diese Abteilung' });

      const [items, total] = await Promise.all([
        request.server.prisma.supervisor.findMany({
          where: { departmentId },
          include: { user: { select: { id: true, name: true } } },
          take: query.limit,
          skip: query.offset,
          orderBy: { userId: 'asc' },
        }),
        request.server.prisma.supervisor.count({ where: { departmentId } }),
      ]);
      const list = items.map((s) => ({ id: s.user.id, name: s.user.name }));
      return reply.send({ items: list, total, limit: query.limit, offset: query.offset });
    }
  );

  app.post(
    '/departments/:departmentId/supervisors',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const body = addAssignmentBodySchema.parse(request.body);

      const department = await request.server.prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });
      const user = await request.server.prisma.user.findUnique({
        where: { id: body.userId },
        select: { id: true, deletedAt: true },
      });
      if (!user || user.deletedAt) return reply.status(404).send({ error: 'User nicht gefunden' });

      const existing = await request.server.prisma.supervisor.findUnique({
        where: { departmentId_userId: { departmentId, userId: body.userId } },
      });
      if (existing) return reply.status(409).send({ error: 'User ist bereits Supervisor' });

      await request.server.prisma.supervisor.create({
        data: { departmentId, userId: body.userId },
      });
      return reply.status(201).send({ departmentId, userId: body.userId });
    }
  );

  app.delete(
    '/departments/:departmentId/supervisors/:userId',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const { departmentId, userId: targetUserId } = departmentIdUserIdParamSchema.parse(
        request.params
      );

      const existing = await request.server.prisma.supervisor.findUnique({
        where: { departmentId_userId: { departmentId, userId: targetUserId } },
      });
      if (!existing)
        return reply.status(404).send({ error: 'Supervisor-Zuordnung nicht gefunden' });

      await request.server.prisma.supervisor.delete({
        where: { departmentId_userId: { departmentId, userId: targetUserId } },
      });
      return reply.status(204).send();
    }
  );
};

export default assignmentsRoutes;
