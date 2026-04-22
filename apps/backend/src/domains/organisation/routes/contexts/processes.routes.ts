import type { FastifyInstance } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../../auth/middleware.js';
import {
  canReadContext,
  canWriteContext,
  canCreateProcessOrProjectForOwner,
} from '../../permissions/contextPermissions.js';
import { setContextDisplayFromProcess } from '../../services/contextOwnerDisplay.js';
import {
  createProcessBodySchema,
  processIdParamSchema,
  processListQuerySchema,
  updateProcessBodySchema,
} from '../../schemas/contexts.js';
import { ownerWhereFromQuery, parseIsoDateOrNull } from './route-helpers.js';
import { findOrCreateOwner } from '../../services/contexts/owner.service.js';
import {
  setArchivedAtForContextDocuments,
  softDeleteProcessWithDocuments,
  restoreProcessWithDocuments,
  unarchiveProcessWithDocuments,
} from '../../services/contexts/context-lifecycle.service.js';

function registerProcessRoutes(app: FastifyInstance): void {
  app.get('/processes', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const query = processListQuerySchema.parse(request.query);
    const userId = getEffectiveUserId(request as RequestWithUser);
    const where = {
      deletedAt: null,
      archivedAt: null,
      ...ownerWhereFromQuery(query, userId),
    };

    const [all, total] = await Promise.all([
      prisma.process.findMany({
        where,
        include: {
          context: {
            include: {
              documents: {
                where: { deletedAt: null },
                take: 5,
                orderBy: { updatedAt: 'desc' },
                select: { id: true, title: true },
              },
            },
          },
          owner: true,
        },
        take: query.limit,
        skip: query.offset,
        orderBy: { name: 'asc' },
      }),
      prisma.process.count({ where }),
    ]);
    const allowed = await Promise.all(
      all.map(async (process) =>
        (await canReadContext(prisma, userId, process.contextId)) ? process : null
      )
    );
    const rawItems = allowed.filter(
      (process): process is NonNullable<typeof process> => process !== null
    );
    const items = rawItems.map((process) => ({
      id: process.id,
      name: process.name,
      contextId: process.contextId,
      owner: process.owner,
      documents: process.context.documents,
    }));
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
    await setContextDisplayFromProcess(prisma, context.id, process.id);
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
      const data: { name?: string; deletedAt?: Date | null; archivedAt?: Date | null } = {};
      if (body.name != null) data.name = body.name;
      if (body.deletedAt !== undefined) data.deletedAt = parseIsoDateOrNull(body.deletedAt);
      if (body.archivedAt !== undefined) {
        const docDate = parseIsoDateOrNull(body.archivedAt);
        data.archivedAt = docDate;
        await setArchivedAtForContextDocuments(prisma, [process.contextId], docDate);
      }

      const updated = await prisma.process.update({
        where: { id: processId },
        data,
        include: { context: true, owner: true },
      });
      if (body.name != null) {
        await prisma.context.update({
          where: { id: process.contextId },
          data: { displayName: body.name },
        });
      }
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

      await softDeleteProcessWithDocuments(prisma, processId, process.contextId);
      return reply.status(204).send();
    }
  );

  app.post(
    '/processes/:processId/restore',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { processId } = processIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const process = await prisma.process.findUniqueOrThrow({
        where: { id: processId },
        select: { contextId: true, deletedAt: true },
      });
      if (process.deletedAt == null) {
        return reply.status(400).send({ error: 'Process is not in trash' });
      }
      const allowed = await canWriteContext(prisma, userId, process.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No write permission' });

      await restoreProcessWithDocuments(prisma, processId, process.contextId);
      return reply.status(204).send();
    }
  );

  app.post(
    '/processes/:processId/unarchive',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { processId } = processIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const process = await prisma.process.findUniqueOrThrow({
        where: { id: processId },
        select: { contextId: true, archivedAt: true },
      });
      if (process.archivedAt == null) {
        return reply.status(400).send({ error: 'Process is not archived' });
      }
      const allowed = await canWriteContext(prisma, userId, process.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No write permission' });

      await unarchiveProcessWithDocuments(prisma, processId, process.contextId);
      return reply.status(204).send();
    }
  );
}

export { registerProcessRoutes };
