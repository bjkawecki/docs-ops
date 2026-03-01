import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { requireAdmin } from '../auth/middleware.js';
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

const organisationRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // --- Companies ---
  app.get('/companies', { preHandler: requireAuth }, async (request, reply) => {
    const query = paginationQuerySchema.parse(request.query);
    const [companies, total] = await Promise.all([
      request.server.prisma.company.findMany({
        include: { departments: true },
        take: query.limit,
        skip: query.offset,
        orderBy: { name: 'asc' },
      }),
      request.server.prisma.company.count(),
    ]);
    return reply.send({ items: companies, total, limit: query.limit, offset: query.offset });
  });

  app.post('/companies', { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const count = await request.server.prisma.company.count();
    if (count > 0) {
      return reply.status(409).send({ error: 'Es kann nur eine Firma angelegt werden.' });
    }
    const body = createCompanyBodySchema.parse(request.body);
    const company = await request.server.prisma.company.create({
      data: { name: body.name },
    });
    return reply.status(201).send(company);
  });

  app.get('/companies/:companyId', { preHandler: requireAuth }, async (request, reply) => {
    const { companyId } = companyIdParamSchema.parse(request.params);
    const company = await request.server.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      include: { departments: true },
    });
    return reply.send(company);
  });

  app.patch(
    '/companies/:companyId',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const body = updateCompanyBodySchema.parse(request.body);
      const company = await request.server.prisma.company.update({
        where: { id: companyId },
        data: body,
      });
      return reply.send(company);
    }
  );

  app.delete(
    '/companies/:companyId',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      try {
        await request.server.prisma.company.delete({ where: { id: companyId } });
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === 'P2003') {
          return reply.status(409).send({
            error: 'Firma kann nicht gelöscht werden, solange Abteilungen existieren.',
          });
        }
        throw err;
      }
      return reply.status(204).send();
    }
  );

  app.get(
    '/companies/:companyId/departments',
    { preHandler: requireAuth },
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
    { preHandler: [requireAuth, requireAdmin] },
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
  app.get('/departments/:departmentId', { preHandler: requireAuth }, async (request, reply) => {
    const { departmentId } = departmentIdParamSchema.parse(request.params);
    const department = await request.server.prisma.department.findUniqueOrThrow({
      where: { id: departmentId },
      include: { company: true, teams: true },
    });
    return reply.send(department);
  });

  app.patch(
    '/departments/:departmentId',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const body = updateDepartmentBodySchema.parse(request.body);
      const department = await request.server.prisma.department.update({
        where: { id: departmentId },
        data: body,
      });
      return reply.send(department);
    }
  );

  app.delete(
    '/departments/:departmentId',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      try {
        await request.server.prisma.department.delete({ where: { id: departmentId } });
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === 'P2003') {
          return reply.status(409).send({
            error:
              'Abteilung kann nicht gelöscht werden, solange Teams oder Prozesse/Projekte (Owner) existieren.',
          });
        }
        throw err;
      }
      return reply.status(204).send();
    }
  );

  app.get(
    '/departments/:departmentId/teams',
    { preHandler: requireAuth },
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
    { preHandler: [requireAuth, requireAdmin] },
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
  app.get('/teams/:teamId', { preHandler: requireAuth }, async (request, reply) => {
    const { teamId } = teamIdParamSchema.parse(request.params);
    const team = await request.server.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      include: { department: { include: { company: true } } },
    });
    return reply.send(team);
  });

  app.patch(
    '/teams/:teamId',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const body = updateTeamBodySchema.parse(request.body);
      const team = await request.server.prisma.team.update({
        where: { id: teamId },
        data: body,
      });
      return reply.send(team);
    }
  );

  app.delete(
    '/teams/:teamId',
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      try {
        await request.server.prisma.team.delete({ where: { id: teamId } });
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === 'P2003') {
          return reply.status(409).send({
            error:
              'Team kann nicht gelöscht werden, solange Prozesse oder Projekte (Owner) diesem Team zugeordnet sind.',
          });
        }
        throw err;
      }
      return reply.status(204).send();
    }
  );
};

export { organisationRoutes };
