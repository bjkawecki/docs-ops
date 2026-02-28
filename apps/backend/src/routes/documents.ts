import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { requireDocumentAccess } from '../permissions/index.js';
import { canReadContext, canWriteContext } from '../permissions/contextPermissions.js';
import { GrantRole } from '../../generated/prisma/client.js';
import {
  paginationQuerySchema,
  contextIdParamSchema,
  documentIdParamSchema,
  createDocumentBodySchema,
  updateDocumentBodySchema,
  putGrantsUsersBodySchema,
  putGrantsTeamsBodySchema,
  putGrantsDepartmentsBodySchema,
} from './schemas/documents.js';

const documentsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /** GET Einzeldokument – nur wenn deletedAt null (Middleware liefert 404 bei gelöscht). */
  app.get<{
    Params: { documentId: string };
  }>(
    '/documents/:documentId',
    {
      preHandler: [requireAuth, requireDocumentAccess('read')],
    },
    async (request, reply) => {
      const { documentId } = documentIdParamSchema.parse(request.params);
      const doc = await request.server.prisma.document.findFirst({
        where: { id: documentId, deletedAt: null },
        select: {
          id: true,
          title: true,
          content: true,
          pdfUrl: true,
          contextId: true,
          createdAt: true,
          updatedAt: true,
          documentTags: { include: { tag: { select: { id: true, name: true } } } },
        },
      });
      if (!doc) return reply.status(404).send({ error: 'Dokument nicht gefunden' });
      return reply.send(doc);
    }
  );

  /** GET Dokumente eines Kontexts – canReadContext, paginiert, ohne gelöschte. */
  app.get('/contexts/:contextId/documents', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = (request as { user?: { id: string } }).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const { contextId } = contextIdParamSchema.parse(request.params);
    const query = paginationQuerySchema.parse(request.query);

    const allowed = await canReadContext(prisma, userId, contextId);
    if (!allowed) return reply.status(403).send({ error: 'Kein Zugriff auf diesen Kontext' });

    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where: { contextId, deletedAt: null },
        select: {
          id: true,
          title: true,
          contextId: true,
          createdAt: true,
          updatedAt: true,
          documentTags: { include: { tag: { select: { id: true, name: true } } } },
        },
        take: query.limit,
        skip: query.offset,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.document.count({ where: { contextId, deletedAt: null } }),
    ]);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

  /** POST Dokument anlegen – canWriteContext(contextId), Tags optional. */
  app.post('/documents', { preHandler: requireAuth }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = (request as { user?: { id: string } }).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Nicht angemeldet' });
    const body = createDocumentBodySchema.parse(request.body);

    const context = await prisma.context.findUnique({
      where: { id: body.contextId },
      include: { userSpace: { select: { ownerUserId: true } } },
    });
    if (!context) return reply.status(404).send({ error: 'Kontext nicht gefunden' });

    const allowed = await canWriteContext(prisma, userId, body.contextId);
    if (!allowed)
      return reply
        .status(403)
        .send({ error: 'Keine Berechtigung, Dokument in diesem Kontext anzulegen' });

    const doc = await prisma.document.create({
      data: {
        title: body.title,
        content: body.content,
        contextId: body.contextId,
      },
    });
    if (body.tagIds.length > 0) {
      await prisma.documentTag.createMany({
        data: body.tagIds.map((tagId) => ({ documentId: doc.id, tagId })),
        skipDuplicates: true,
      });
    }
    const created = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
      select: {
        id: true,
        title: true,
        content: true,
        pdfUrl: true,
        contextId: true,
        createdAt: true,
        updatedAt: true,
        documentTags: { include: { tag: { select: { id: true, name: true } } } },
      },
    });
    return reply.status(201).send(created);
  });

  /** PATCH Dokument – requireDocumentAccess('write'), optional title, content, tagIds. */
  app.patch(
    '/documents/:documentId',
    { preHandler: [requireAuth, requireDocumentAccess('write')] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      const body = updateDocumentBodySchema.parse(request.body);

      const updateData: { title?: string; content?: string } = {};
      if (body.title != null) updateData.title = body.title;
      if (body.content != null) updateData.content = body.content;

      if (body.tagIds !== undefined) {
        await prisma.documentTag.deleteMany({ where: { documentId } });
        if (body.tagIds.length > 0) {
          await prisma.documentTag.createMany({
            data: body.tagIds.map((tagId) => ({ documentId, tagId })),
            skipDuplicates: true,
          });
        }
      }

      const doc = await prisma.document.update({
        where: { id: documentId },
        data: updateData,
        select: {
          id: true,
          title: true,
          content: true,
          pdfUrl: true,
          contextId: true,
          createdAt: true,
          updatedAt: true,
          documentTags: { include: { tag: { select: { id: true, name: true } } } },
        },
      });
      return reply.send(doc);
    }
  );

  /** DELETE Dokument – Soft-Delete (deletedAt setzen). */
  app.delete(
    '/documents/:documentId',
    { preHandler: [requireAuth, requireDocumentAccess('write')] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      await prisma.document.update({
        where: { id: documentId },
        data: { deletedAt: new Date() },
      });
      return reply.status(204).send();
    }
  );

  /** GET Grants (User, Team, Department) – requireDocumentAccess('read'). */
  app.get(
    '/documents/:documentId/grants',
    { preHandler: [requireAuth, requireDocumentAccess('read')] },
    async (request, reply) => {
      const { documentId } = documentIdParamSchema.parse(request.params);
      const [grantUser, grantTeam, grantDepartment] = await Promise.all([
        request.server.prisma.documentGrantUser.findMany({
          where: { documentId },
          select: { userId: true, role: true },
        }),
        request.server.prisma.documentGrantTeam.findMany({
          where: { documentId },
          select: { teamId: true, role: true },
        }),
        request.server.prisma.documentGrantDepartment.findMany({
          where: { documentId },
          select: { departmentId: true, role: true },
        }),
      ]);
      return reply.send({
        users: grantUser.map((g) => ({ userId: g.userId, role: g.role })),
        teams: grantTeam.map((g) => ({ teamId: g.teamId, role: g.role })),
        departments: grantDepartment.map((g) => ({ departmentId: g.departmentId, role: g.role })),
      });
    }
  );

  /** PUT User-Grants ersetzen – requireDocumentAccess('write'). */
  app.put(
    '/documents/:documentId/grants/users',
    { preHandler: [requireAuth, requireDocumentAccess('write')] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      const { grants } = putGrantsUsersBodySchema.parse(request.body);
      await prisma.documentGrantUser.deleteMany({ where: { documentId } });
      if (grants.length > 0) {
        await prisma.documentGrantUser.createMany({
          data: grants.map((g) => ({
            documentId,
            userId: g.userId,
            role: g.role as GrantRole,
          })),
          skipDuplicates: true,
        });
      }
      const list = await prisma.documentGrantUser.findMany({
        where: { documentId },
        select: { userId: true, role: true },
      });
      return reply.send({ grants: list });
    }
  );

  /** PUT Team-Grants ersetzen – requireDocumentAccess('write'). */
  app.put(
    '/documents/:documentId/grants/teams',
    { preHandler: [requireAuth, requireDocumentAccess('write')] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      const { grants } = putGrantsTeamsBodySchema.parse(request.body);
      await prisma.documentGrantTeam.deleteMany({ where: { documentId } });
      if (grants.length > 0) {
        await prisma.documentGrantTeam.createMany({
          data: grants.map((g) => ({
            documentId,
            teamId: g.teamId,
            role: g.role as GrantRole,
          })),
          skipDuplicates: true,
        });
      }
      const list = await prisma.documentGrantTeam.findMany({
        where: { documentId },
        select: { teamId: true, role: true },
      });
      return reply.send({ grants: list });
    }
  );

  /** PUT Department-Grants ersetzen – requireDocumentAccess('write'). */
  app.put(
    '/documents/:documentId/grants/departments',
    { preHandler: [requireAuth, requireDocumentAccess('write')] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      const { grants } = putGrantsDepartmentsBodySchema.parse(request.body);
      await prisma.documentGrantDepartment.deleteMany({ where: { documentId } });
      if (grants.length > 0) {
        await prisma.documentGrantDepartment.createMany({
          data: grants.map((g) => ({
            documentId,
            departmentId: g.departmentId,
            role: g.role as GrantRole,
          })),
          skipDuplicates: true,
        });
      }
      const list = await prisma.documentGrantDepartment.findMany({
        where: { documentId },
        select: { departmentId: true, role: true },
      });
      return reply.send({ grants: list });
    }
  );

  /** GET Tags (Autocomplete) – requireAuth. */
  app.get('/tags', { preHandler: requireAuth }, async (request, reply) => {
    const tags = await request.server.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return reply.send(tags);
  });
};

export { documentsRoutes };
