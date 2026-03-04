import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  preHandlerWrap,
  getEffectiveUserId,
  type RequestWithUser,
} from '../auth/middleware.js';
import { requireDocumentAccess, canDeleteDocument } from '../permissions/index.js';
import { canReadContext, canWriteContext } from '../permissions/contextPermissions.js';
import { type GrantRole } from '../../generated/prisma/client.js';
import { getReadableCatalogScope } from '../permissions/catalogPermissions.js';
import {
  paginationQuerySchema,
  catalogDocumentsQuerySchema,
  contextIdParamSchema,
  documentIdParamSchema,
  createDocumentBodySchema,
  updateDocumentBodySchema,
  putGrantsUsersBodySchema,
  putGrantsTeamsBodySchema,
  putGrantsDepartmentsBodySchema,
} from './schemas/documents.js';

const documentsRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  /** GET Catalog: all documents the user can read, with filters and pagination. */
  app.get('/documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = catalogDocumentsQuerySchema.parse(request.query);

    const { contextIds, documentIdsFromGrants } = await getReadableCatalogScope(prisma, userId);

    const baseWhere: Record<string, unknown> = {
      deletedAt: null,
      OR: [
        ...(contextIds.length > 0 ? [{ contextId: { in: contextIds } }] : []),
        ...(documentIdsFromGrants.length > 0 ? [{ id: { in: documentIdsFromGrants } }] : []),
      ],
    };
    if ((baseWhere.OR as unknown[]).length === 0) {
      return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
    }

    const contextConditions: Record<string, unknown>[] = [];
    if (query.contextType === 'process') {
      contextConditions.push({ process: { isNot: null } });
    } else if (query.contextType === 'project') {
      contextConditions.push({
        OR: [{ project: { isNot: null } }, { subcontext: { isNot: null } }],
      });
    }
    if (query.companyId) {
      contextConditions.push({
        OR: [
          { process: { owner: { companyId: query.companyId } } },
          { project: { owner: { companyId: query.companyId } } },
          { subcontext: { project: { owner: { companyId: query.companyId } } } },
        ],
      });
    } else if (query.departmentId) {
      contextConditions.push({
        OR: [
          { process: { owner: { departmentId: query.departmentId } } },
          { project: { owner: { departmentId: query.departmentId } } },
          { subcontext: { project: { owner: { departmentId: query.departmentId } } } },
        ],
      });
    } else if (query.teamId) {
      contextConditions.push({
        OR: [
          { process: { owner: { teamId: query.teamId } } },
          { project: { owner: { teamId: query.teamId } } },
          { subcontext: { project: { owner: { teamId: query.teamId } } } },
        ],
      });
    }
    if (contextConditions.length > 0) {
      baseWhere.context =
        contextConditions.length === 1 ? contextConditions[0] : { AND: contextConditions };
    }

    if (query.tagIds.length > 0) {
      baseWhere.documentTags = { some: { tagId: { in: query.tagIds } } };
    }
    if (query.search?.trim()) {
      baseWhere.title = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const select = {
      id: true,
      title: true,
      contextId: true,
      createdAt: true,
      updatedAt: true,
      documentTags: { include: { tag: { select: { id: true, name: true } } } },
      context: {
        select: {
          id: true,
          process: {
            select: {
              id: true,
              name: true,
              owner: {
                select: {
                  company: { select: { name: true } },
                  department: { select: { name: true } },
                  team: { select: { name: true } },
                  ownerUserId: true,
                  ownerUser: { select: { name: true } },
                },
              },
            },
          },
          project: {
            select: {
              id: true,
              name: true,
              owner: {
                select: {
                  company: { select: { name: true } },
                  department: { select: { name: true } },
                  team: { select: { name: true } },
                  ownerUserId: true,
                  ownerUser: { select: { name: true } },
                },
              },
            },
          },
          subcontext: {
            select: {
              id: true,
              name: true,
              project: {
                select: {
                  id: true,
                  name: true,
                  owner: {
                    select: {
                      company: { select: { name: true } },
                      department: { select: { name: true } },
                      team: { select: { name: true } },
                      ownerUserId: true,
                      ownerUser: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where: baseWhere,
        select,
        orderBy: { updatedAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.document.count({ where: baseWhere }),
    ]);

    const mapped = items.map((doc) => {
      const ctx = doc.context;
      let contextType: 'process' | 'project' = 'process';
      let contextName = '';
      let ownerDisplay = 'Personal';
      let contextProcessId: string | null = null;
      let contextProjectId: string | null = null;
      if (ctx.process) {
        contextType = 'process';
        contextName = ctx.process.name;
        contextProcessId = ctx.process.id;
        const o = ctx.process.owner;
        ownerDisplay =
          o.company?.name ??
          o.department?.name ??
          o.team?.name ??
          (o.ownerUserId != null ? (o.ownerUser?.name ?? 'Personal') : 'Personal');
      } else if (ctx.project) {
        contextType = 'project';
        contextName = ctx.project.name;
        contextProjectId = ctx.project.id;
        const o = ctx.project.owner;
        ownerDisplay =
          o.company?.name ??
          o.department?.name ??
          o.team?.name ??
          (o.ownerUserId != null ? (o.ownerUser?.name ?? 'Personal') : 'Personal');
      } else if (ctx.subcontext) {
        contextType = 'project';
        contextName = ctx.subcontext.name;
        contextProjectId = ctx.subcontext.project.id;
        const o = ctx.subcontext.project.owner;
        ownerDisplay =
          o.company?.name ??
          o.department?.name ??
          o.team?.name ??
          (o.ownerUserId != null ? (o.ownerUser?.name ?? 'Personal') : 'Personal');
      }
      return {
        id: doc.id,
        title: doc.title,
        contextId: doc.contextId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        documentTags: doc.documentTags,
        contextType,
        contextName,
        ownerDisplay,
        contextProcessId,
        contextProjectId,
      };
    });

    return reply.send({
      items: mapped,
      total,
      limit: query.limit,
      offset: query.offset,
    });
  });

  /** GET Einzeldokument – nur wenn deletedAt null (Middleware liefert 404 bei gelöscht). */
  app.get<{
    Params: { documentId: string };
  }>(
    '/documents/:documentId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
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
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      return reply.send(doc);
    }
  );

  /** GET Dokumente eines Kontexts – canReadContext, paginiert, ohne gelöschte. */
  app.get(
    '/contexts/:contextId/documents',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { contextId } = contextIdParamSchema.parse(request.params);
      const query = paginationQuerySchema.parse(request.query);

      const allowed = await canReadContext(prisma, userId, contextId);
      if (!allowed) return reply.status(403).send({ error: 'No access to this context' });

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
    }
  );

  /** POST Dokument anlegen – canWriteContext(contextId), Tags optional. */
  app.post('/documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const body = createDocumentBodySchema.parse(request.body);

    const context = await prisma.context.findUnique({
      where: { id: body.contextId },
      include: {
        process: { include: { owner: { select: { ownerUserId: true } } } },
        project: { include: { owner: { select: { ownerUserId: true } } } },
        subcontext: {
          include: { project: { include: { owner: { select: { ownerUserId: true } } } } },
        },
      },
    });
    if (!context) return reply.status(404).send({ error: 'Context not found' });

    const allowed = await canWriteContext(prisma, userId, body.contextId);
    if (!allowed)
      return reply
        .status(403)
        .send({ error: 'Permission denied to create document in this context' });

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
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
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

  /** DELETE Dokument – Soft-Delete (deletedAt setzen). Nur Scope-Lead (canDeleteDocument). */
  app.delete(
    '/documents/:documentId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const allowed = await canDeleteDocument(prisma, userId, documentId);
      if (!allowed)
        return reply.status(403).send({ error: 'Permission denied to delete this document' });
      await prisma.documentPinnedInScope.deleteMany({ where: { documentId } });
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
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))] },
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
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
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
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
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
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
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
  app.get('/tags', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const tags = await request.server.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return reply.send(tags);
  });

  return Promise.resolve();
};

export { documentsRoutes };
