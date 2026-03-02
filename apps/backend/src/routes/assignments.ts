import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth, getEffectiveUserId, type RequestWithUser } from '../auth/middleware.js';
import {
  canManageTeamMembers,
  canManageTeamLeaders,
  canManageDepartmentLeads,
  canManageCompanyLeads,
  canViewTeam,
  canViewDepartment,
  canViewCompany,
} from '../permissions/index.js';
import {
  assignmentListQuerySchema,
  teamIdParamSchema,
  companyIdParamSchema,
  departmentIdParamSchema,
  teamIdUserIdParamSchema,
  companyIdUserIdParamSchema,
  departmentIdUserIdParamSchema,
  addAssignmentBodySchema,
} from './schemas/assignments.js';

const assignmentsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // --- Company Lead ---
  app.get(
    '/companies/:companyId/company-leads',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const query = assignmentListQuerySchema.parse(request.query);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canViewCompany(request.server.prisma, userId, companyId);
      if (!allowed) return reply.status(403).send({ error: 'Kein Zugriff auf diese Firma' });

      const [items, total] = await Promise.all([
        request.server.prisma.companyLead.findMany({
          where: { companyId },
          include: { user: { select: { id: true, name: true } } },
          take: query.limit,
          skip: query.offset,
          orderBy: { userId: 'asc' },
        }),
        request.server.prisma.companyLead.count({ where: { companyId } }),
      ]);
      const list = items.map((c) => ({ id: c.user.id, name: c.user.name }));
      return reply.send({ items: list, total, limit: query.limit, offset: query.offset });
    }
  );

  app.post(
    '/companies/:companyId/company-leads',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const body = addAssignmentBodySchema.parse(request.body);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageCompanyLeads(request.server.prisma, userId, companyId);
      if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung' });

      const company = await request.server.prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company) return reply.status(404).send({ error: 'Firma nicht gefunden' });
      const user = await request.server.prisma.user.findUnique({
        where: { id: body.userId },
        select: { id: true, deletedAt: true },
      });
      if (!user || user.deletedAt) return reply.status(404).send({ error: 'User nicht gefunden' });

      const existing = await request.server.prisma.companyLead.findUnique({
        where: { companyId_userId: { companyId, userId: body.userId } },
      });
      if (existing) return reply.status(409).send({ error: 'User ist bereits Company Lead' });

      await request.server.prisma.companyLead.create({
        data: { companyId, userId: body.userId },
      });
      return reply.status(201).send({ companyId, userId: body.userId });
    }
  );

  app.delete(
    '/companies/:companyId/company-leads/:userId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { companyId, userId: targetUserId } = companyIdUserIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageCompanyLeads(request.server.prisma, userId, companyId);
      if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung' });

      const existing = await request.server.prisma.companyLead.findUnique({
        where: { companyId_userId: { companyId, userId: targetUserId } },
      });
      if (!existing)
        return reply.status(404).send({ error: 'Company-Lead-Zuordnung nicht gefunden' });

      await request.server.prisma.companyLead.delete({
        where: { companyId_userId: { companyId, userId: targetUserId } },
      });
      return reply.status(204).send();
    }
  );

  // --- Team-Mitglieder ---
  app.get('/teams/:teamId/members', { preHandler: requireAuth }, async (request, reply) => {
    const { teamId } = teamIdParamSchema.parse(request.params);
    const query = assignmentListQuerySchema.parse(request.query);
    const userId = getEffectiveUserId(request as RequestWithUser);

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
    const userId = getEffectiveUserId(request as RequestWithUser);

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
      const userId = getEffectiveUserId(request as RequestWithUser);

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

  // --- Team Lead ---
  app.get('/teams/:teamId/team-leads', { preHandler: requireAuth }, async (request, reply) => {
    const { teamId } = teamIdParamSchema.parse(request.params);
    const query = assignmentListQuerySchema.parse(request.query);
    const userId = getEffectiveUserId(request as RequestWithUser);

    const allowed = await canViewTeam(request.server.prisma, userId, teamId);
    if (!allowed) return reply.status(403).send({ error: 'Kein Zugriff auf dieses Team' });

    const [items, total] = await Promise.all([
      request.server.prisma.teamLead.findMany({
        where: { teamId },
        include: { user: { select: { id: true, name: true } } },
        take: query.limit,
        skip: query.offset,
        orderBy: { userId: 'asc' },
      }),
      request.server.prisma.teamLead.count({ where: { teamId } }),
    ]);
    const list = items.map((l) => ({ id: l.user.id, name: l.user.name }));
    return reply.send({ items: list, total, limit: query.limit, offset: query.offset });
  });

  app.post('/teams/:teamId/team-leads', { preHandler: requireAuth }, async (request, reply) => {
    const { teamId } = teamIdParamSchema.parse(request.params);
    const body = addAssignmentBodySchema.parse(request.body);
    const userId = getEffectiveUserId(request as RequestWithUser);

    const allowed = await canManageTeamLeaders(request.server.prisma, userId, teamId);
    if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung' });

    const team = await request.server.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return reply.status(404).send({ error: 'Team nicht gefunden' });
    const user = await request.server.prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return reply.status(404).send({ error: 'User nicht gefunden' });

    const existing = await request.server.prisma.teamLead.findUnique({
      where: { teamId_userId: { teamId, userId: body.userId } },
    });
    if (existing) return reply.status(409).send({ error: 'User ist bereits Team Lead' });

    await request.server.prisma.teamLead.create({
      data: { teamId, userId: body.userId },
    });
    return reply.status(201).send({ teamId, userId: body.userId });
  });

  app.delete(
    '/teams/:teamId/team-leads/:userId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { teamId, userId: targetUserId } = teamIdUserIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageTeamLeaders(request.server.prisma, userId, teamId);
      if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung' });

      const existing = await request.server.prisma.teamLead.findUnique({
        where: { teamId_userId: { teamId, userId: targetUserId } },
      });
      if (!existing) return reply.status(404).send({ error: 'Team-Lead-Zuordnung nicht gefunden' });

      await request.server.prisma.teamLead.delete({
        where: { teamId_userId: { teamId, userId: targetUserId } },
      });
      return reply.status(204).send();
    }
  );

  // --- Department Lead ---
  app.get(
    '/departments/:departmentId/department-leads',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const query = assignmentListQuerySchema.parse(request.query);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canViewDepartment(request.server.prisma, userId, departmentId);
      if (!allowed) return reply.status(403).send({ error: 'Kein Zugriff auf diese Abteilung' });

      const [items, total] = await Promise.all([
        request.server.prisma.departmentLead.findMany({
          where: { departmentId },
          include: { user: { select: { id: true, name: true } } },
          take: query.limit,
          skip: query.offset,
          orderBy: { userId: 'asc' },
        }),
        request.server.prisma.departmentLead.count({ where: { departmentId } }),
      ]);
      const list = items.map((d) => ({ id: d.user.id, name: d.user.name }));
      return reply.send({ items: list, total, limit: query.limit, offset: query.offset });
    }
  );

  app.post(
    '/departments/:departmentId/department-leads',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const body = addAssignmentBodySchema.parse(request.body);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageDepartmentLeads(request.server.prisma, userId, departmentId);
      if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung' });

      const department = await request.server.prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });
      const user = await request.server.prisma.user.findUnique({
        where: { id: body.userId },
        select: { id: true, deletedAt: true },
      });
      if (!user || user.deletedAt) return reply.status(404).send({ error: 'User nicht gefunden' });

      const existing = await request.server.prisma.departmentLead.findUnique({
        where: { departmentId_userId: { departmentId, userId: body.userId } },
      });
      if (existing) return reply.status(409).send({ error: 'User ist bereits Department Lead' });

      await request.server.prisma.departmentLead.create({
        data: { departmentId, userId: body.userId },
      });
      return reply.status(201).send({ departmentId, userId: body.userId });
    }
  );

  app.delete(
    '/departments/:departmentId/department-leads/:userId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { departmentId, userId: targetUserId } = departmentIdUserIdParamSchema.parse(
        request.params
      );
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageDepartmentLeads(request.server.prisma, userId, departmentId);
      if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung' });

      const existing = await request.server.prisma.departmentLead.findUnique({
        where: { departmentId_userId: { departmentId, userId: targetUserId } },
      });
      if (!existing)
        return reply.status(404).send({ error: 'Department-Lead-Zuordnung nicht gefunden' });

      await request.server.prisma.departmentLead.delete({
        where: { departmentId_userId: { departmentId, userId: targetUserId } },
      });
      return reply.status(204).send();
    }
  );
};

export default assignmentsRoutes;
