import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../auth/middleware.js';
import {
  canReadContext,
  canWriteContext,
  canCreateProcessOrProjectForOwner,
} from '../permissions/contextPermissions.js';
import {
  processListQuerySchema,
  projectListQuerySchema,
  createProcessBodySchema,
  updateProcessBodySchema,
  createProjectBodySchema,
  updateProjectBodySchema,
  createSubcontextBodySchema,
  updateSubcontextBodySchema,
  processIdParamSchema,
  projectIdParamSchema,
  subcontextIdParamSchema,
  paginationQuerySchema,
  type PaginationQuery,
} from './schemas/contexts.js';

/** Finds or creates an Owner for companyId, departmentId, teamId or ownerUserId (exactly one). */
async function findOrCreateOwner(
  prisma: PrismaClient,
  opts: { companyId?: string; departmentId?: string; teamId?: string; ownerUserId?: string }
): Promise<{ id: string }> {
  if (opts.companyId) {
    let owner = await prisma.owner.findFirst({
      where: { companyId: opts.companyId, departmentId: null, teamId: null, ownerUserId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({
        data: { companyId: opts.companyId },
      });
    }
    return { id: owner.id };
  }
  if (opts.departmentId) {
    let owner = await prisma.owner.findFirst({
      where: { departmentId: opts.departmentId, companyId: null, teamId: null, ownerUserId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({
        data: { departmentId: opts.departmentId },
      });
    }
    return { id: owner.id };
  }
  if (opts.teamId) {
    let owner = await prisma.owner.findFirst({
      where: { teamId: opts.teamId, companyId: null, departmentId: null, ownerUserId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({
        data: { teamId: opts.teamId },
      });
    }
    return { id: owner.id };
  }
  if (opts.ownerUserId) {
    let owner = await prisma.owner.findFirst({
      where: { ownerUserId: opts.ownerUserId, companyId: null, departmentId: null, teamId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({
        data: { ownerUserId: opts.ownerUserId },
      });
    }
    return { id: owner.id };
  }
  throw new Error('One of companyId, departmentId, teamId or ownerUserId is required');
}

const contextRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  // --- Processes ---
  app.get('/processes', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const query = processListQuerySchema.parse(request.query);
    const userId = getEffectiveUserId(request as RequestWithUser);
    const where = {
      deletedAt: null,
      ...(query.companyId != null && { owner: { companyId: query.companyId } }),
      ...(query.departmentId != null && { owner: { departmentId: query.departmentId } }),
      ...(query.teamId != null && { owner: { teamId: query.teamId } }),
      ...(query.ownerUserId === 'me' && { owner: { ownerUserId: userId } }),
    };

    const [all, total] = await Promise.all([
      prisma.process.findMany({
        where,
        include: { context: true, owner: true },
        take: query.limit,
        skip: query.offset,
        orderBy: { name: 'asc' },
      }),
      prisma.process.count({ where }),
    ]);
    const allowed = await Promise.all(
      all.map(async (p) => ((await canReadContext(prisma, userId, p.contextId)) ? p : null))
    );
    const items = allowed.filter((p): p is NonNullable<typeof p> => p !== null);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

  app.post('/processes', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const body = createProcessBodySchema.parse(request.body);
    const allowed = await canCreateProcessOrProjectForOwner(prisma, userId, {
      companyId: body.companyId ?? undefined,
      departmentId: body.departmentId ?? undefined,
      teamId: body.teamId ?? undefined,
      ownerUserId: body.personal === true ? userId : undefined,
    });
    if (!allowed) return reply.status(403).send({ error: 'Permission denied to create process' });
    const owner = await findOrCreateOwner(prisma, {
      companyId: body.companyId ?? undefined,
      departmentId: body.departmentId ?? undefined,
      teamId: body.teamId ?? undefined,
      ownerUserId: body.personal === true ? userId : undefined,
    });
    const context = await prisma.context.create({ data: {} });
    const process = await prisma.process.create({
      data: {
        name: body.name,
        contextId: context.id,
        ownerId: owner.id,
      },
      include: { context: true, owner: true },
    });
    return reply.status(201).send(process);
  });

  app.get(
    '/processes/:processId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { processId } = processIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const process = await prisma.process.findUniqueOrThrow({
        where: { id: processId },
        include: { context: true, owner: true },
      });
      const [readAllowed, writeAllowed] = await Promise.all([
        canReadContext(prisma, userId, process.contextId),
        canWriteContext(prisma, userId, process.contextId),
      ]);
      if (!readAllowed) return reply.status(403).send({ error: 'No access' });
      return reply.send({ ...process, canWriteContext: writeAllowed });
    }
  );

  app.patch(
    '/processes/:processId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { processId } = processIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const process = await prisma.process.findUniqueOrThrow({
        where: { id: processId },
        select: { contextId: true },
      });
      const allowed = await canWriteContext(prisma, userId, process.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No write permission' });
      const body = updateProcessBodySchema.parse(request.body);
      const updated = await prisma.process.update({
        where: { id: processId },
        data: {
          ...(body.name != null && { name: body.name }),
          ...(body.deletedAt !== undefined && {
            deletedAt: body.deletedAt ? new Date(body.deletedAt) : null,
          }),
        },
        include: { context: true, owner: true },
      });
      return reply.send(updated);
    }
  );

  app.delete(
    '/processes/:processId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { processId } = processIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const process = await prisma.process.findUniqueOrThrow({
        where: { id: processId },
        select: { contextId: true },
      });
      const allowed = await canWriteContext(prisma, userId, process.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No write permission' });
      await prisma.process.delete({ where: { id: processId } });
      return reply.status(204).send();
    }
  );

  // --- Projects ---
  app.get('/projects', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const query = projectListQuerySchema.parse(request.query);
    const userId = getEffectiveUserId(request as RequestWithUser);
    const where = {
      deletedAt: null,
      ...(query.companyId != null && { owner: { companyId: query.companyId } }),
      ...(query.departmentId != null && { owner: { departmentId: query.departmentId } }),
      ...(query.teamId != null && { owner: { teamId: query.teamId } }),
      ...(query.ownerUserId === 'me' && { owner: { ownerUserId: userId } }),
    };

    const [all, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: { context: true, owner: true, subcontexts: true },
        take: query.limit,
        skip: query.offset,
        orderBy: { name: 'asc' },
      }),
      prisma.project.count({ where }),
    ]);
    const allowed = await Promise.all(
      all.map(async (p) => ((await canReadContext(prisma, userId, p.contextId)) ? p : null))
    );
    const items = allowed.filter((p): p is NonNullable<typeof p> => p !== null);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

  app.post('/projects', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const body = createProjectBodySchema.parse(request.body);
    const allowed = await canCreateProcessOrProjectForOwner(prisma, userId, {
      companyId: body.companyId ?? undefined,
      departmentId: body.departmentId ?? undefined,
      teamId: body.teamId ?? undefined,
      ownerUserId: body.personal === true ? userId : undefined,
    });
    if (!allowed) return reply.status(403).send({ error: 'Permission denied to create project' });
    const owner = await findOrCreateOwner(prisma, {
      companyId: body.companyId ?? undefined,
      departmentId: body.departmentId ?? undefined,
      teamId: body.teamId ?? undefined,
      ownerUserId: body.personal === true ? userId : undefined,
    });
    const context = await prisma.context.create({ data: {} });
    const project = await prisma.project.create({
      data: {
        name: body.name,
        contextId: context.id,
        ownerId: owner.id,
      },
      include: { context: true, owner: true, subcontexts: true },
    });
    return reply.status(201).send(project);
  });

  app.get('/projects/:projectId', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { projectId } = projectIdParamSchema.parse(request.params);
    const userId = getEffectiveUserId(request as RequestWithUser);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { context: true, owner: true, subcontexts: true },
    });
    const [readAllowed, writeAllowed] = await Promise.all([
      canReadContext(prisma, userId, project.contextId),
      canWriteContext(prisma, userId, project.contextId),
    ]);
    if (!readAllowed) return reply.status(403).send({ error: 'No access' });
    return reply.send({ ...project, canWriteContext: writeAllowed });
  });

  app.patch(
    '/projects/:projectId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { projectId } = projectIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { contextId: true },
      });
      const allowed = await canWriteContext(prisma, userId, project.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No write permission' });
      const body = updateProjectBodySchema.parse(request.body);
      const updated = await prisma.project.update({
        where: { id: projectId },
        data: {
          ...(body.name != null && { name: body.name }),
          ...(body.deletedAt !== undefined && {
            deletedAt: body.deletedAt ? new Date(body.deletedAt) : null,
          }),
        },
        include: { context: true, owner: true, subcontexts: true },
      });
      return reply.send(updated);
    }
  );

  app.delete(
    '/projects/:projectId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { projectId } = projectIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { contextId: true },
      });
      const allowed = await canWriteContext(prisma, userId, project.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No write permission' });
      await prisma.project.delete({ where: { id: projectId } });
      return reply.status(204).send();
    }
  );

  // --- Subcontexts ---
  app.get(
    '/projects/:projectId/subcontexts',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { projectId } = projectIdParamSchema.parse(request.params);
      const query: PaginationQuery = paginationQuerySchema.parse(request.query);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { contextId: true },
      });
      const allowed = await canReadContext(prisma, userId, project.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No access' });
      const [items, total] = await Promise.all([
        prisma.subcontext.findMany({
          where: { projectId },
          include: { context: true },
          take: query.limit,
          skip: query.offset,
          orderBy: { name: 'asc' },
        }),
        prisma.subcontext.count({ where: { projectId } }),
      ]);
      return reply.send({ items, total, limit: query.limit, offset: query.offset });
    }
  );

  app.post(
    '/projects/:projectId/subcontexts',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { projectId } = projectIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { contextId: true },
      });
      const allowed = await canWriteContext(prisma, userId, project.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No write permission' });
      const body = createSubcontextBodySchema.parse(request.body);
      const context = await prisma.context.create({ data: {} });
      const subcontext = await prisma.subcontext.create({
        data: { name: body.name, contextId: context.id, projectId },
        include: { context: true, project: true },
      });
      return reply.status(201).send(subcontext);
    }
  );

  app.get(
    '/subcontexts/:subcontextId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { subcontextId } = subcontextIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const subcontext = await prisma.subcontext.findUniqueOrThrow({
        where: { id: subcontextId },
        include: { context: true, project: { include: { owner: true } } },
      });
      const allowed = await canReadContext(prisma, userId, subcontext.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No access' });
      const writeAllowed = await canWriteContext(prisma, userId, subcontext.contextId);
      return reply.send({ ...subcontext, canWriteContext: writeAllowed });
    }
  );

  app.patch(
    '/subcontexts/:subcontextId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { subcontextId } = subcontextIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const subcontext = await prisma.subcontext.findUniqueOrThrow({
        where: { id: subcontextId },
        include: { project: { select: { contextId: true } } },
      });
      const allowed = await canWriteContext(prisma, userId, subcontext.project.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No write permission' });
      const body = updateSubcontextBodySchema.parse(request.body);
      const updated = await prisma.subcontext.update({
        where: { id: subcontextId },
        data: body,
        include: { context: true, project: true },
      });
      return reply.send(updated);
    }
  );

  app.delete(
    '/subcontexts/:subcontextId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { subcontextId } = subcontextIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const subcontext = await prisma.subcontext.findUniqueOrThrow({
        where: { id: subcontextId },
        include: { project: { select: { contextId: true } } },
      });
      const allowed = await canWriteContext(prisma, userId, subcontext.project.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No write permission' });
      await prisma.subcontext.delete({ where: { id: subcontextId } });
      return reply.status(204).send();
    }
  );

  return Promise.resolve();
};

export { contextRoutes };
