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
import { setContextDisplayFromProject } from '../../services/contextOwnerDisplay.js';
import {
  createProjectBodySchema,
  projectIdParamSchema,
  projectListQuerySchema,
  updateProjectBodySchema,
} from '../../schemas/contexts.js';
import { ownerWhereFromQuery, parseIsoDateOrNull } from './route-helpers.js';
import { findOrCreateOwner } from '../../services/contexts/owner.service.js';
import {
  getProjectContextIds,
  setArchivedAtForContextDocuments,
  softDeleteProjectWithDocuments,
  restoreProjectWithDocuments,
  unarchiveProjectWithDocuments,
} from '../../services/contexts/context-lifecycle.service.js';

function registerProjectRoutes(app: FastifyInstance): void {
  app.get('/projects', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const query = projectListQuerySchema.parse(request.query);
    const userId = getEffectiveUserId(request as RequestWithUser);
    const where = {
      deletedAt: null,
      archivedAt: null,
      ...ownerWhereFromQuery(query, userId),
    };

    const [all, total] = await Promise.all([
      prisma.project.findMany({
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
          subcontexts: { select: { id: true, name: true } },
        },
        take: query.limit,
        skip: query.offset,
        orderBy: { name: 'asc' },
      }),
      prisma.project.count({ where }),
    ]);
    const allowed = await Promise.all(
      all.map(async (project) =>
        (await canReadContext(prisma, userId, project.contextId)) ? project : null
      )
    );
    const rawItems = allowed.filter(
      (project): project is NonNullable<typeof project> => project !== null
    );
    const items = rawItems.map((project) => ({
      id: project.id,
      name: project.name,
      contextId: project.contextId,
      owner: project.owner,
      documents: project.context.documents,
      subcontexts: project.subcontexts,
    }));
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
    await setContextDisplayFromProject(prisma, context.id, project.id);
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

      const contextIds = await getProjectContextIds(prisma, projectId);
      const body = updateProjectBodySchema.parse(request.body);
      const data: { name?: string; deletedAt?: Date | null; archivedAt?: Date | null } = {};
      if (body.name != null) data.name = body.name;
      if (body.deletedAt !== undefined) data.deletedAt = parseIsoDateOrNull(body.deletedAt);
      if (body.archivedAt !== undefined) {
        const docDate = parseIsoDateOrNull(body.archivedAt);
        data.archivedAt = docDate;
        await setArchivedAtForContextDocuments(prisma, contextIds, docDate);
      }
      const updated = await prisma.project.update({
        where: { id: projectId },
        data,
        include: { context: true, owner: true, subcontexts: true },
      });
      if (body.name != null) {
        await prisma.context.update({
          where: { id: project.contextId },
          data: { displayName: body.name },
        });
      }
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

      const contextIds = await getProjectContextIds(prisma, projectId);
      await softDeleteProjectWithDocuments(prisma, projectId, contextIds);
      return reply.status(204).send();
    }
  );

  app.post(
    '/projects/:projectId/restore',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { projectId } = projectIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { contextId: true, deletedAt: true },
      });
      if (project.deletedAt == null) {
        return reply.status(400).send({ error: 'Project is not in trash' });
      }
      const allowed = await canWriteContext(prisma, userId, project.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No write permission' });

      const contextIds = await getProjectContextIds(prisma, projectId);
      await restoreProjectWithDocuments(prisma, projectId, contextIds);
      return reply.status(204).send();
    }
  );

  app.post(
    '/projects/:projectId/unarchive',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { projectId } = projectIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { contextId: true, archivedAt: true },
      });
      if (project.archivedAt == null) {
        return reply.status(400).send({ error: 'Project is not archived' });
      }
      const allowed = await canWriteContext(prisma, userId, project.contextId);
      if (!allowed) return reply.status(403).send({ error: 'No write permission' });

      const contextIds = await getProjectContextIds(prisma, projectId);
      await unarchiveProjectWithDocuments(prisma, projectId, contextIds);
      return reply.status(204).send();
    }
  );
}

export { registerProjectRoutes };
