import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { requireAuth } from '../auth/middleware.js';
import {
  canReadContext,
  canWriteContext,
  canCreateProcessOrProjectForOwner,
} from '../permissions/contextPermissions.js';
import {
  paginationQuerySchema,
  createProcessBodySchema,
  updateProcessBodySchema,
  createProjectBodySchema,
  updateProjectBodySchema,
  createSubcontextBodySchema,
  updateSubcontextBodySchema,
  createUserSpaceBodySchema,
  updateUserSpaceBodySchema,
  processIdParamSchema,
  projectIdParamSchema,
  subcontextIdParamSchema,
  userSpaceIdParamSchema,
} from './schemas/contexts.js';

/** Findet oder erstellt einen Owner für departmentId oder teamId (genau einer). */
async function findOrCreateOwner(
  prisma: PrismaClient,
  opts: { departmentId?: string; teamId?: string }
): Promise<{ id: string }> {
  if (opts.departmentId) {
    let owner = await prisma.owner.findFirst({
      where: { departmentId: opts.departmentId, teamId: null },
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
      where: { teamId: opts.teamId, departmentId: null },
    });
    if (!owner) {
      owner = await prisma.owner.create({
        data: { teamId: opts.teamId },
      });
    }
    return { id: owner.id };
  }
  throw new Error('departmentId oder teamId erforderlich');
}

const contextRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const getUserId = (req: { user?: { id: string } }) => (req as { user: { id: string } }).user?.id;

  // --- Processes ---
  app.get('/processes', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const query = paginationQuerySchema.parse(request.query);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });

    const [all, total] = await Promise.all([
      prisma.process.findMany({
        where: { deletedAt: null },
        include: { context: true, owner: true },
        take: query.limit,
        skip: query.offset,
        orderBy: { name: 'asc' },
      }),
      prisma.process.count({ where: { deletedAt: null } }),
    ]);
    const allowed = await Promise.all(
      all.map(async (p) => ((await canReadContext(prisma, userId, p.contextId)) ? p : null))
    );
    const items = allowed.filter((p): p is NonNullable<typeof p> => p !== null);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

  app.post('/processes', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const body = createProcessBodySchema.parse(request.body);
    const allowed = await canCreateProcessOrProjectForOwner(prisma, userId, {
      departmentId: body.departmentId ?? undefined,
      teamId: body.teamId ?? undefined,
    });
    if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung, Prozess anzulegen' });
    const owner = await findOrCreateOwner(prisma, {
      departmentId: body.departmentId ?? undefined,
      teamId: body.teamId ?? undefined,
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

  app.get('/processes/:processId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { processId } = processIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const process = await prisma.process.findUniqueOrThrow({
      where: { id: processId },
      include: { context: true, owner: true },
    });
    const allowed = await canReadContext(prisma, userId, process.contextId);
    if (!allowed) return reply.status(403).send({ error: 'Kein Zugriff' });
    return reply.send(process);
  });

  app.patch('/processes/:processId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { processId } = processIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const process = await prisma.process.findUniqueOrThrow({
      where: { id: processId },
      select: { contextId: true },
    });
    const allowed = await canWriteContext(prisma, userId, process.contextId);
    if (!allowed) return reply.status(403).send({ error: 'Keine Schreibberechtigung' });
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
  });

  app.delete('/processes/:processId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { processId } = processIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const process = await prisma.process.findUniqueOrThrow({
      where: { id: processId },
      select: { contextId: true },
    });
    const allowed = await canWriteContext(prisma, userId, process.contextId);
    if (!allowed) return reply.status(403).send({ error: 'Keine Schreibberechtigung' });
    await prisma.process.delete({ where: { id: processId } });
    return reply.status(204).send();
  });

  // --- Projects ---
  app.get('/projects', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const query = paginationQuerySchema.parse(request.query);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const [all, total] = await Promise.all([
      prisma.project.findMany({
        where: { deletedAt: null },
        include: { context: true, owner: true, subcontexts: true },
        take: query.limit,
        skip: query.offset,
        orderBy: { name: 'asc' },
      }),
      prisma.project.count({ where: { deletedAt: null } }),
    ]);
    const allowed = await Promise.all(
      all.map(async (p) => ((await canReadContext(prisma, userId, p.contextId)) ? p : null))
    );
    const items = allowed.filter((p): p is NonNullable<typeof p> => p !== null);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

  app.post('/projects', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const body = createProjectBodySchema.parse(request.body);
    const allowed = await canCreateProcessOrProjectForOwner(prisma, userId, {
      departmentId: body.departmentId ?? undefined,
      teamId: body.teamId ?? undefined,
    });
    if (!allowed) return reply.status(403).send({ error: 'Keine Berechtigung, Projekt anzulegen' });
    const owner = await findOrCreateOwner(prisma, {
      departmentId: body.departmentId ?? undefined,
      teamId: body.teamId ?? undefined,
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

  app.get('/projects/:projectId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { projectId } = projectIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { context: true, owner: true, subcontexts: true },
    });
    const allowed = await canReadContext(prisma, userId, project.contextId);
    if (!allowed) return reply.status(403).send({ error: 'Kein Zugriff' });
    return reply.send(project);
  });

  app.patch('/projects/:projectId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { projectId } = projectIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { contextId: true },
    });
    const allowed = await canWriteContext(prisma, userId, project.contextId);
    if (!allowed) return reply.status(403).send({ error: 'Keine Schreibberechtigung' });
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
  });

  app.delete('/projects/:projectId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { projectId } = projectIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { contextId: true },
    });
    const allowed = await canWriteContext(prisma, userId, project.contextId);
    if (!allowed) return reply.status(403).send({ error: 'Keine Schreibberechtigung' });
    await prisma.project.delete({ where: { id: projectId } });
    return reply.status(204).send();
  });

  // --- Subcontexts ---
  app.get(
    '/projects/:projectId/subcontexts',
    { preHandler: requireAuth },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { projectId } = projectIdParamSchema.parse(request.params);
      const query = paginationQuerySchema.parse(request.query);
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { contextId: true },
      });
      const allowed = await canReadContext(prisma, userId, project.contextId);
      if (!allowed) return reply.status(403).send({ error: 'Kein Zugriff' });
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
    { preHandler: requireAuth },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { projectId } = projectIdParamSchema.parse(request.params);
      const userId = getUserId(request);
      if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { contextId: true },
      });
      const allowed = await canWriteContext(prisma, userId, project.contextId);
      if (!allowed) return reply.status(403).send({ error: 'Keine Schreibberechtigung' });
      const body = createSubcontextBodySchema.parse(request.body);
      const context = await prisma.context.create({ data: {} });
      const subcontext = await prisma.subcontext.create({
        data: { name: body.name, contextId: context.id, projectId },
        include: { context: true, project: true },
      });
      return reply.status(201).send(subcontext);
    }
  );

  app.get('/subcontexts/:subcontextId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { subcontextId } = subcontextIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const subcontext = await prisma.subcontext.findUniqueOrThrow({
      where: { id: subcontextId },
      include: { context: true, project: true },
    });
    const allowed = await canReadContext(prisma, userId, subcontext.contextId);
    if (!allowed) return reply.status(403).send({ error: 'Kein Zugriff' });
    return reply.send(subcontext);
  });

  app.patch('/subcontexts/:subcontextId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { subcontextId } = subcontextIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const subcontext = await prisma.subcontext.findUniqueOrThrow({
      where: { id: subcontextId },
      include: { project: { select: { contextId: true } } },
    });
    const allowed = await canWriteContext(prisma, userId, subcontext.project.contextId);
    if (!allowed) return reply.status(403).send({ error: 'Keine Schreibberechtigung' });
    const body = updateSubcontextBodySchema.parse(request.body);
    const updated = await prisma.subcontext.update({
      where: { id: subcontextId },
      data: body,
      include: { context: true, project: true },
    });
    return reply.send(updated);
  });

  app.delete('/subcontexts/:subcontextId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { subcontextId } = subcontextIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const subcontext = await prisma.subcontext.findUniqueOrThrow({
      where: { id: subcontextId },
      include: { project: { select: { contextId: true } } },
    });
    const allowed = await canWriteContext(prisma, userId, subcontext.project.contextId);
    if (!allowed) return reply.status(403).send({ error: 'Keine Schreibberechtigung' });
    await prisma.subcontext.delete({ where: { id: subcontextId } });
    return reply.status(204).send();
  });

  // --- UserSpaces ---
  app.get('/user-spaces', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const query = paginationQuerySchema.parse(request.query);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const [items, total] = await Promise.all([
      prisma.userSpace.findMany({
        where: { ownerUserId: userId },
        include: { context: true },
        take: query.limit,
        skip: query.offset,
        orderBy: { name: 'asc' },
      }),
      prisma.userSpace.count({ where: { ownerUserId: userId } }),
    ]);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

  app.post('/user-spaces', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const body = createUserSpaceBodySchema.parse(request.body);
    const context = await prisma.context.create({ data: {} });
    const userSpace = await prisma.userSpace.create({
      data: { name: body.name, contextId: context.id, ownerUserId: userId },
      include: { context: true, owner: true },
    });
    return reply.status(201).send(userSpace);
  });

  app.get('/user-spaces/:userSpaceId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { userSpaceId } = userSpaceIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const userSpace = await prisma.userSpace.findUniqueOrThrow({
      where: { id: userSpaceId },
      include: { context: true, owner: true },
    });
    if (
      userSpace.ownerUserId !== userId &&
      !(request as { user?: { isAdmin?: boolean } }).user?.isAdmin
    ) {
      return reply.status(403).send({ error: 'Nur Owner oder Admin' });
    }
    return reply.send(userSpace);
  });

  app.patch('/user-spaces/:userSpaceId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { userSpaceId } = userSpaceIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const userSpace = await prisma.userSpace.findUniqueOrThrow({
      where: { id: userSpaceId },
      select: { ownerUserId: true },
    });
    if (userSpace.ownerUserId !== userId) return reply.status(403).send({ error: 'Nur Owner' });
    const body = updateUserSpaceBodySchema.parse(request.body);
    const updated = await prisma.userSpace.update({
      where: { id: userSpaceId },
      data: body,
      include: { context: true, owner: true },
    });
    return reply.send(updated);
  });

  app.delete('/user-spaces/:userSpaceId', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const { userSpaceId } = userSpaceIdParamSchema.parse(request.params);
    const userId = getUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const userSpace = await prisma.userSpace.findUniqueOrThrow({
      where: { id: userSpaceId },
      select: { ownerUserId: true },
    });
    if (userSpace.ownerUserId !== userId) return reply.status(403).send({ error: 'Nur Owner' });
    await prisma.userSpace.delete({ where: { id: userSpaceId } });
    return reply.status(204).send();
  });
};

export { contextRoutes };
