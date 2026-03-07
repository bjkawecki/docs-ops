import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuthPreHandler, requireAdminPreHandler } from '../auth/middleware.js';
import { setOwnerDisplayName, refreshContextOwnerDisplayForOwner } from '../contextOwnerDisplay.js';
import {
  paginationQuerySchema,
  createCompanyBodySchema,
  updateCompanyBodySchema,
  createDepartmentBodySchema,
  updateDepartmentBodySchema,
  createTeamBodySchema,
  updateTeamBodySchema,
  companyIdParamSchema,
  departmentIdParamSchema,
  teamIdParamSchema,
} from './schemas/organisation.js';

const organisationRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  // --- Companies ---
  app.get('/companies', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const query = paginationQuerySchema.parse(request.query);
    const [companies, total] = await Promise.all([
      request.server.prisma.company.findMany({
        include: {
          departments: {
            include: {
              _count: { select: { teams: true } },
              departmentLeads: { include: { user: { select: { id: true, name: true } } } },
            },
          },
        },
        take: query.limit,
        skip: query.offset,
        orderBy: { name: 'asc' },
      }),
      request.server.prisma.company.count(),
    ]);
    return reply.send({ items: companies, total, limit: query.limit, offset: query.offset });
  });

  app.post(
    '/companies',
    { preHandler: [requireAuthPreHandler, requireAdminPreHandler] },
    async (request, reply) => {
      const count = await request.server.prisma.company.count();
      if (count > 0) {
        return reply.status(409).send({ error: 'Only one company can be created.' });
      }
      const body = createCompanyBodySchema.parse(request.body);
      const company = await request.server.prisma.company.create({
        data: { name: body.name },
      });
      return reply.status(201).send(company);
    }
  );

  app.get(
    '/companies/:companyId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const company = await request.server.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        include: { departments: true },
      });
      return reply.send(company);
    }
  );

  app.patch(
    '/companies/:companyId',
    { preHandler: [requireAuthPreHandler, requireAdminPreHandler] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { companyId } = companyIdParamSchema.parse(request.params);
      const body = updateCompanyBodySchema.parse(request.body);
      const company = await prisma.company.update({
        where: { id: companyId },
        data: body,
      });
      if (Object.keys(body).length > 0) {
        const owners = await prisma.owner.findMany({
          where: { companyId },
          select: { id: true },
        });
        for (const o of owners) {
          await setOwnerDisplayName(prisma, o.id);
          await refreshContextOwnerDisplayForOwner(prisma, o.id);
        }
      }
      return reply.send(company);
    }
  );

  app.delete(
    '/companies/:companyId',
    { preHandler: [requireAuthPreHandler, requireAdminPreHandler] },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      try {
        await request.server.prisma.documentPinnedInScope.deleteMany({
          where: { scopeType: 'company', scopeId: companyId },
        });
        await request.server.prisma.company.delete({ where: { id: companyId } });
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === 'P2003') {
          return reply.status(409).send({
            error: 'Company cannot be deleted while departments exist.',
          });
        }
        throw err;
      }
      return reply.status(204).send();
    }
  );

  app.get(
    '/companies/:companyId/departments',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const query = paginationQuerySchema.parse(request.query);
      const [items, total] = await Promise.all([
        request.server.prisma.department.findMany({
          where: { companyId },
          include: { teams: true },
          take: query.limit,
          skip: query.offset,
          orderBy: { name: 'asc' },
        }),
        request.server.prisma.department.count({ where: { companyId } }),
      ]);
      return reply.send({ items, total, limit: query.limit, offset: query.offset });
    }
  );

  app.post(
    '/companies/:companyId/departments',
    { preHandler: [requireAuthPreHandler, requireAdminPreHandler] },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const body = createDepartmentBodySchema.parse(request.body);
      const department = await request.server.prisma.department.create({
        data: { name: body.name, companyId },
      });
      return reply.status(201).send(department);
    }
  );

  // --- Departments (top-level by id) ---
  app.get(
    '/departments/:departmentId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const department = await request.server.prisma.department.findUniqueOrThrow({
        where: { id: departmentId },
        include: { company: true, teams: true },
      });
      return reply.send(department);
    }
  );

  app.patch(
    '/departments/:departmentId',
    { preHandler: [requireAuthPreHandler, requireAdminPreHandler] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const body = updateDepartmentBodySchema.parse(request.body);
      const department = await prisma.department.update({
        where: { id: departmentId },
        data: body,
      });
      if (Object.keys(body).length > 0) {
        const owners = await prisma.owner.findMany({
          where: { departmentId },
          select: { id: true },
        });
        for (const o of owners) {
          await setOwnerDisplayName(prisma, o.id);
          await refreshContextOwnerDisplayForOwner(prisma, o.id);
        }
      }
      return reply.send(department);
    }
  );

  app.delete(
    '/departments/:departmentId',
    { preHandler: [requireAuthPreHandler, requireAdminPreHandler] },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      try {
        await request.server.prisma.documentPinnedInScope.deleteMany({
          where: { scopeType: 'department', scopeId: departmentId },
        });
        await request.server.prisma.department.delete({ where: { id: departmentId } });
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === 'P2003') {
          return reply.status(409).send({
            error: 'Department cannot be deleted while it has teams or processes/projects (owner).',
          });
        }
        throw err;
      }
      return reply.status(204).send();
    }
  );

  app.get(
    '/departments/:departmentId/teams',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const query = paginationQuerySchema.parse(request.query);
      const [items, total] = await Promise.all([
        request.server.prisma.team.findMany({
          where: { departmentId },
          include: { department: true },
          take: query.limit,
          skip: query.offset,
          orderBy: { name: 'asc' },
        }),
        request.server.prisma.team.count({ where: { departmentId } }),
      ]);
      return reply.send({ items, total, limit: query.limit, offset: query.offset });
    }
  );

  app.post(
    '/departments/:departmentId/teams',
    { preHandler: [requireAuthPreHandler, requireAdminPreHandler] },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const body = createTeamBodySchema.parse(request.body);
      const team = await request.server.prisma.team.create({
        data: { name: body.name, departmentId },
      });
      return reply.status(201).send(team);
    }
  );

  // --- Teams (top-level by id) ---
  app.get('/teams/:teamId', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const { teamId } = teamIdParamSchema.parse(request.params);
    const team = await request.server.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      include: { department: { include: { company: true } } },
    });
    return reply.send(team);
  });

  app.patch(
    '/teams/:teamId',
    { preHandler: [requireAuthPreHandler, requireAdminPreHandler] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { teamId } = teamIdParamSchema.parse(request.params);
      const body = updateTeamBodySchema.parse(request.body);
      const team = await prisma.team.update({
        where: { id: teamId },
        data: body,
      });
      if (Object.keys(body).length > 0) {
        const owners = await prisma.owner.findMany({
          where: { teamId },
          select: { id: true },
        });
        for (const o of owners) {
          await setOwnerDisplayName(prisma, o.id);
          await refreshContextOwnerDisplayForOwner(prisma, o.id);
        }
      }
      return reply.send(team);
    }
  );

  app.delete(
    '/teams/:teamId',
    { preHandler: [requireAuthPreHandler, requireAdminPreHandler] },
    async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      try {
        await request.server.prisma.documentPinnedInScope.deleteMany({
          where: { scopeType: 'team', scopeId: teamId },
        });
        await request.server.prisma.team.delete({ where: { id: teamId } });
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === 'P2003') {
          return reply.status(409).send({
            error: 'Team cannot be deleted while processes or projects (owner) are assigned to it.',
          });
        }
        throw err;
      }
      return reply.status(204).send();
    }
  );

  return Promise.resolve();
};

export { organisationRoutes };
