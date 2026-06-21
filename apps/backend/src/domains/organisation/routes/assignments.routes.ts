import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../auth/middleware.js';
import {
  canManageTeamMembers,
  canManageTeamLeaders,
  canManageDepartmentLeads,
  canManageCompanyLeads,
} from '../permissions/index.js';
import { canViewScope } from '../permissions/scopeVisibility.js';
import {
  assignmentListQuerySchema,
  teamIdParamSchema,
  companyIdParamSchema,
  departmentIdParamSchema,
  teamIdUserIdParamSchema,
  companyIdUserIdParamSchema,
  departmentIdUserIdParamSchema,
  addAssignmentBodySchema,
} from '../schemas/assignments.js';
import {
  createTeamLeadAfterVerify,
  createTeamMemberAfterVerify,
  sendTeamAssignmentListIfAllowed,
} from './assignments-route-helpers.js';
import { enqueueOrgNotificationSafe } from '../../notifications/services/orgNotificationService.js';

const assignmentsRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  // --- Company Lead ---
  app.get(
    '/companies/:companyId/company-leads',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const query = assignmentListQuerySchema.parse(request.query);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canViewScope(request.server.prisma, userId, {
        type: 'company',
        companyId,
      });
      if (!allowed) return reply.status(403).send({ error: 'No access to this company' });

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
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const body = addAssignmentBodySchema.parse(request.body);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageCompanyLeads(request.server.prisma, userId, companyId);
      if (!allowed) return reply.status(403).send({ error: 'Permission denied' });

      const company = await request.server.prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company) return reply.status(404).send({ error: 'Company not found' });
      const user = await request.server.prisma.user.findUnique({
        where: { id: body.userId },
        select: { id: true, deletedAt: true },
      });
      if (!user || user.deletedAt) return reply.status(404).send({ error: 'User not found' });

      const existing = await request.server.prisma.companyLead.findUnique({
        where: { companyId_userId: { companyId, userId: body.userId } },
      });
      if (existing) return reply.status(409).send({ error: 'User is already company lead' });

      await request.server.prisma.companyLead.create({
        data: { companyId, userId: body.userId },
      });
      enqueueOrgNotificationSafe(request.log, {
        eventType: 'company-lead-assigned',
        targetUserIds: [body.userId],
        actorUserId: userId,
        payload: {
          userId: body.userId,
          scopeType: 'company',
          scopeId: companyId,
          scopeName: company.name,
        },
      });
      return reply.status(201).send({ companyId, userId: body.userId });
    }
  );

  app.delete(
    '/companies/:companyId/company-leads/:userId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { companyId, userId: targetUserId } = companyIdUserIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageCompanyLeads(request.server.prisma, userId, companyId);
      if (!allowed) return reply.status(403).send({ error: 'Permission denied' });

      const existing = await request.server.prisma.companyLead.findUnique({
        where: { companyId_userId: { companyId, userId: targetUserId } },
      });
      if (!existing) return reply.status(404).send({ error: 'Company lead assignment not found' });

      const company = await request.server.prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true },
      });

      await request.server.prisma.companyLead.delete({
        where: { companyId_userId: { companyId, userId: targetUserId } },
      });
      if (company != null) {
        enqueueOrgNotificationSafe(request.log, {
          eventType: 'company-lead-removed',
          targetUserIds: [targetUserId],
          actorUserId: userId,
          payload: {
            userId: targetUserId,
            scopeType: 'company',
            scopeId: companyId,
            scopeName: company.name,
          },
        });
      }
      return reply.status(204).send();
    }
  );

  // --- Team-Mitglieder / Team-Leads (GET-Listen) ---
  for (const { path, source } of [
    { path: '/teams/:teamId/members' as const, source: 'member' as const },
    { path: '/teams/:teamId/team-leads' as const, source: 'lead' as const },
  ]) {
    app.get(path, { preHandler: requireAuthPreHandler }, async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const query = assignmentListQuerySchema.parse(request.query);
      const userId = getEffectiveUserId(request as RequestWithUser);
      await sendTeamAssignmentListIfAllowed(
        request.server.prisma,
        userId,
        teamId,
        query,
        reply,
        source
      );
    });
  }

  app.post(
    '/teams/:teamId/members',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const body = addAssignmentBodySchema.parse(request.body);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageTeamMembers(request.server.prisma, userId, teamId);
      if (!allowed) return reply.status(403).send({ error: 'Permission denied' });

      const ok = await createTeamMemberAfterVerify(
        request.server.prisma,
        teamId,
        body.userId,
        reply
      );
      if (!ok) return;
      const team = await request.server.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true },
      });
      if (team != null) {
        enqueueOrgNotificationSafe(request.log, {
          eventType: 'team-member-added',
          targetUserIds: [body.userId],
          actorUserId: userId,
          payload: {
            userId: body.userId,
            scopeType: 'team',
            scopeId: teamId,
            scopeName: team.name,
          },
        });
      }
      return reply.status(201).send({ teamId, userId: body.userId });
    }
  );

  app.delete(
    '/teams/:teamId/members/:userId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { teamId, userId: targetUserId } = teamIdUserIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageTeamMembers(request.server.prisma, userId, teamId);
      if (!allowed) return reply.status(403).send({ error: 'Permission denied' });

      const existing = await request.server.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: targetUserId } },
      });
      if (!existing) return reply.status(404).send({ error: 'Membership not found' });

      const team = await request.server.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true },
      });
      const wasLead = await request.server.prisma.teamLead.findUnique({
        where: { teamId_userId: { teamId, userId: targetUserId } },
      });

      await request.server.prisma.$transaction([
        request.server.prisma.teamLead.deleteMany({
          where: { teamId, userId: targetUserId },
        }),
        request.server.prisma.teamMember.delete({
          where: { teamId_userId: { teamId, userId: targetUserId } },
        }),
      ]);
      if (team != null) {
        enqueueOrgNotificationSafe(request.log, {
          eventType: 'team-member-removed',
          targetUserIds: [targetUserId],
          actorUserId: userId,
          payload: {
            userId: targetUserId,
            scopeType: 'team',
            scopeId: teamId,
            scopeName: team.name,
          },
        });
        if (wasLead != null) {
          enqueueOrgNotificationSafe(request.log, {
            eventType: 'team-lead-removed',
            targetUserIds: [targetUserId],
            actorUserId: userId,
            payload: {
              userId: targetUserId,
              scopeType: 'team',
              scopeId: teamId,
              scopeName: team.name,
            },
          });
        }
      }
      return reply.status(204).send();
    }
  );

  app.post(
    '/teams/:teamId/team-leads',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const body = addAssignmentBodySchema.parse(request.body);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageTeamLeaders(request.server.prisma, userId, teamId);
      if (!allowed) return reply.status(403).send({ error: 'Permission denied' });

      const ok = await createTeamLeadAfterVerify(request.server.prisma, teamId, body.userId, reply);
      if (!ok) return;
      const team = await request.server.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true },
      });
      if (team != null) {
        enqueueOrgNotificationSafe(request.log, {
          eventType: 'team-lead-assigned',
          targetUserIds: [body.userId],
          actorUserId: userId,
          payload: {
            userId: body.userId,
            scopeType: 'team',
            scopeId: teamId,
            scopeName: team.name,
          },
        });
      }
      return reply.status(201).send({ teamId, userId: body.userId });
    }
  );

  app.delete(
    '/teams/:teamId/team-leads/:userId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { teamId, userId: targetUserId } = teamIdUserIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageTeamLeaders(request.server.prisma, userId, teamId);
      if (!allowed) return reply.status(403).send({ error: 'Permission denied' });

      const existing = await request.server.prisma.teamLead.findUnique({
        where: { teamId_userId: { teamId, userId: targetUserId } },
      });
      if (!existing) return reply.status(404).send({ error: 'Team lead assignment not found' });

      const team = await request.server.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true },
      });

      await request.server.prisma.teamLead.delete({
        where: { teamId_userId: { teamId, userId: targetUserId } },
      });
      if (team != null) {
        enqueueOrgNotificationSafe(request.log, {
          eventType: 'team-lead-removed',
          targetUserIds: [targetUserId],
          actorUserId: userId,
          payload: {
            userId: targetUserId,
            scopeType: 'team',
            scopeId: teamId,
            scopeName: team.name,
          },
        });
      }
      return reply.status(204).send();
    }
  );

  // --- Department Lead ---
  app.get(
    '/departments/:departmentId/department-leads',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const query = assignmentListQuerySchema.parse(request.query);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canViewScope(request.server.prisma, userId, {
        type: 'department',
        departmentId,
      });
      if (!allowed) return reply.status(403).send({ error: 'No access to this department' });

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
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const body = addAssignmentBodySchema.parse(request.body);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageDepartmentLeads(request.server.prisma, userId, departmentId);
      if (!allowed) return reply.status(403).send({ error: 'Permission denied' });

      const department = await request.server.prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) return reply.status(404).send({ error: 'Department not found' });
      const user = await request.server.prisma.user.findUnique({
        where: { id: body.userId },
        select: { id: true, deletedAt: true },
      });
      if (!user || user.deletedAt) return reply.status(404).send({ error: 'User not found' });

      const existing = await request.server.prisma.departmentLead.findUnique({
        where: { departmentId_userId: { departmentId, userId: body.userId } },
      });
      if (existing) return reply.status(409).send({ error: 'User is already department lead' });

      await request.server.prisma.departmentLead.create({
        data: { departmentId, userId: body.userId },
      });
      enqueueOrgNotificationSafe(request.log, {
        eventType: 'department-lead-assigned',
        targetUserIds: [body.userId],
        actorUserId: userId,
        payload: {
          userId: body.userId,
          scopeType: 'department',
          scopeId: departmentId,
          scopeName: department.name,
        },
      });
      return reply.status(201).send({ departmentId, userId: body.userId });
    }
  );

  app.delete(
    '/departments/:departmentId/department-leads/:userId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { departmentId, userId: targetUserId } = departmentIdUserIdParamSchema.parse(
        request.params
      );
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canManageDepartmentLeads(request.server.prisma, userId, departmentId);
      if (!allowed) return reply.status(403).send({ error: 'Permission denied' });

      const existing = await request.server.prisma.departmentLead.findUnique({
        where: { departmentId_userId: { departmentId, userId: targetUserId } },
      });
      if (!existing)
        return reply.status(404).send({ error: 'Department lead assignment not found' });

      const department = await request.server.prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true, name: true },
      });

      await request.server.prisma.departmentLead.delete({
        where: { departmentId_userId: { departmentId, userId: targetUserId } },
      });
      if (department != null) {
        enqueueOrgNotificationSafe(request.log, {
          eventType: 'department-lead-removed',
          targetUserIds: [targetUserId],
          actorUserId: userId,
          payload: {
            userId: targetUserId,
            scopeType: 'department',
            scopeId: departmentId,
            scopeName: department.name,
          },
        });
      }
      return reply.status(204).send();
    }
  );

  return Promise.resolve();
};

export default assignmentsRoutes;
