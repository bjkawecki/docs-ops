import type { FastifyInstance } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../../auth/middleware.js';
import { canReadContext, canWriteContext } from '../../permissions/contextPermissions.js';
import { setContextDisplayFromSubcontext } from '../../services/contextOwnerDisplay.js';
import {
  createSubcontextBodySchema,
  paginationQuerySchema,
  projectIdParamSchema,
  subcontextIdParamSchema,
  updateSubcontextBodySchema,
} from '../../schemas/contexts.js';

function registerSubcontextRoutes(app: FastifyInstance): void {
  app.get(
    '/projects/:projectId/subcontexts',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { projectId } = projectIdParamSchema.parse(request.params);
      const query = paginationQuerySchema.parse(request.query);
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
      await setContextDisplayFromSubcontext(prisma, context.id, subcontext.id);
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
      if (body.name != null) {
        await prisma.context.update({
          where: { id: subcontext.contextId },
          data: { displayName: body.name },
        });
      }
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
}

export { registerSubcontextRoutes };
