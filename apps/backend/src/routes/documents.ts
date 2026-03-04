import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  preHandlerWrap,
  getEffectiveUserId,
  type RequestWithUser,
} from '../auth/middleware.js';
import {
  requireDocumentAccess,
  canDeleteDocument,
  canWrite,
  DOCUMENT_FOR_PERMISSION_INCLUDE,
} from '../permissions/index.js';
import {
  canReadContext,
  canWriteContext,
  getContextOwnerId,
  canReadScopeForOwner,
  canCreateTagForOwner,
} from '../permissions/contextPermissions.js';
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
  tagIdParamSchema,
  createTagBodySchema,
  getTagsQuerySchema,
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

  /** GET Einzeldokument – nur wenn deletedAt null. Liefert canWrite/canDelete für UI. */
  app.get<{
    Params: { documentId: string };
  }>(
    '/documents/:documentId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const doc = await prisma.document.findFirst({
        where: { id: documentId, deletedAt: null },
        include: {
          ...DOCUMENT_FOR_PERMISSION_INCLUDE,
          documentTags: { include: { tag: { select: { id: true, name: true } } } },
          createdBy: { select: { name: true } },
          grantUser: { include: { user: { select: { name: true } } } },
          grantTeam: { include: { team: { select: { name: true } } } },
          grantDepartment: { include: { department: { select: { name: true } } } },
        },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      const [writeAllowed, deleteAllowed] = await Promise.all([
        canWrite(prisma, userId, doc),
        canDeleteDocument(prisma, userId, documentId),
      ]);
      const owner =
        doc.context.process?.owner ??
        doc.context.project?.owner ??
        doc.context.subcontext?.project?.owner ??
        null;
      const contextOwnerId = owner?.id ?? null;
      const scope =
        owner?.ownerUserId != null
          ? { type: 'personal' as const }
          : owner?.companyId != null
            ? { type: 'company' as const, id: owner.companyId }
            : owner?.departmentId != null
              ? { type: 'department' as const, id: owner.departmentId }
              : owner?.teamId != null
                ? { type: 'team' as const, id: owner.teamId }
                : null;

      const ctx = doc.context;
      let contextType: 'process' | 'project' = 'process';
      let contextName = '';
      let contextProcessId: string | null = null;
      let contextProjectId: string | null = null;
      let contextProjectName: string | null = null;
      let subcontextId: string | null = null;
      let subcontextName: string | null = null;
      if (ctx.process) {
        contextType = 'process';
        contextName = ctx.process.name;
        contextProcessId = ctx.process.id;
      } else if (ctx.project) {
        contextType = 'project';
        contextName = ctx.project.name;
        contextProjectId = ctx.project.id;
      } else if (ctx.subcontext) {
        contextType = 'project';
        contextName = ctx.subcontext.name;
        contextProjectId = ctx.subcontext.project.id;
        contextProjectName = ctx.subcontext.project.name;
        subcontextId = ctx.subcontext.id;
        subcontextName = ctx.subcontext.name;
      }

      const writers = {
        users: (doc.grantUser as { userId: string; role: string; user: { name: string } }[])
          .filter((g) => g.role === 'Write')
          .map((g) => ({ userId: g.userId, name: g.user.name })),
        teams: (doc.grantTeam as { teamId: string; role: string; team: { name: string } }[])
          .filter((g) => g.role === 'Write')
          .map((g) => ({ teamId: g.teamId, name: g.team.name })),
        departments: (
          doc.grantDepartment as {
            departmentId: string;
            role: string;
            department: { name: string };
          }[]
        )
          .filter((g) => g.role === 'Write')
          .map((g) => ({ departmentId: g.departmentId, name: g.department.name })),
      };

      return reply.send({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        pdfUrl: doc.pdfUrl,
        contextId: doc.contextId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        publishedAt: doc.publishedAt,
        description: doc.description,
        createdById: doc.createdById,
        createdByName: doc.createdBy?.name ?? null,
        writers,
        documentTags: doc.documentTags,
        canWrite: writeAllowed,
        canDelete: deleteAllowed,
        scope,
        contextOwnerId,
        contextType,
        contextName,
        contextProcessId,
        contextProjectId,
        contextProjectName,
        subcontextId,
        subcontextName,
      });
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

    const contextOwnerId = await getContextOwnerId(prisma, body.contextId);
    if (body.tagIds.length > 0) {
      if (!contextOwnerId)
        return reply
          .status(400)
          .send({ error: 'Kontext hat keinen Owner; Tags können nicht zugewiesen werden.' });
      const tags = await prisma.tag.findMany({
        where: { id: { in: body.tagIds } },
        select: { id: true, ownerId: true },
      });
      const invalid = tags.some((t) => t.ownerId !== contextOwnerId);
      if (invalid || tags.length !== body.tagIds.length) {
        return reply.status(400).send({
          error: 'Ein oder mehrere Tags gehören nicht zum Kontext-Scope.',
        });
      }
    }

    const doc = await prisma.document.create({
      data: {
        title: body.title,
        content: body.content,
        contextId: body.contextId,
        description: body.description ?? null,
        publishedAt: body.publishedAt ?? null,
        createdById: userId,
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
        publishedAt: true,
        description: true,
        createdById: true,
        createdBy: { select: { name: true } },
        documentTags: { include: { tag: { select: { id: true, name: true } } } },
      },
    });
    return reply.status(201).send({
      ...created,
      createdByName: created.createdBy?.name ?? null,
      writers: { users: [], teams: [], departments: [] },
    });
  });

  /** PATCH Dokument – requireDocumentAccess('write'), optional title, content, tagIds. */
  app.patch(
    '/documents/:documentId',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      const body = updateDocumentBodySchema.parse(request.body);

      const updateData: {
        title?: string;
        content?: string;
        description?: string | null;
        publishedAt?: Date | null;
      } = {};
      if (body.title != null) updateData.title = body.title;
      if (body.content != null) updateData.content = body.content;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.publishedAt !== undefined) updateData.publishedAt = body.publishedAt;

      if (body.tagIds !== undefined) {
        if (body.tagIds.length > 0) {
          const doc = await prisma.document.findUnique({
            where: { id: documentId },
            select: { contextId: true },
          });
          if (!doc) return reply.status(404).send({ error: 'Document not found' });
          const contextOwnerId = await getContextOwnerId(prisma, doc.contextId);
          if (!contextOwnerId)
            return reply
              .status(400)
              .send({ error: 'Kontext hat keinen Owner; Tags können nicht zugewiesen werden.' });
          const tags = await prisma.tag.findMany({
            where: { id: { in: body.tagIds } },
            select: { id: true, ownerId: true },
          });
          const invalid = tags.some((t) => t.ownerId !== contextOwnerId);
          if (invalid || tags.length !== body.tagIds.length) {
            return reply.status(400).send({
              error: 'Ein oder mehrere Tags gehören nicht zum Kontext-Scope.',
            });
          }
        }
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
          publishedAt: true,
          description: true,
          createdById: true,
          createdBy: { select: { name: true } },
          documentTags: { include: { tag: { select: { id: true, name: true } } } },
        },
      });
      return reply.send({
        ...doc,
        createdByName: doc.createdBy?.name ?? null,
        writers: { users: [], teams: [], departments: [] },
      });
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

  /** GET Tags (scope-aware) – ownerId oder contextId erforderlich, canReadScopeForOwner. */
  app.get('/tags', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = getTagsQuerySchema.parse(request.query);
    let ownerId: string | null = query.ownerId ?? null;
    if (!ownerId && query.contextId) {
      ownerId = await getContextOwnerId(prisma, query.contextId);
    }
    if (!ownerId) {
      return reply.status(400).send({
        error: 'ownerId or contextId is required',
      });
    }
    const canRead = await canReadScopeForOwner(prisma, userId, ownerId);
    if (!canRead) return reply.status(403).send({ error: 'No access to this scope' });
    const tags = await prisma.tag.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return reply.send(tags);
  });

  /** POST Tag anlegen – ownerId oder contextId im Body, canCreateTagForOwner. Bei doppeltem Namen im Scope 409. */
  app.post('/tags', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const body = createTagBodySchema.parse(request.body);
    let ownerId: string | null | undefined = body.ownerId;
    if (ownerId == null && body.contextId != null) {
      ownerId = await getContextOwnerId(prisma, body.contextId);
      if (ownerId == null) return reply.status(400).send({ error: 'Context has no owner' });
    }
    if (ownerId == null)
      return reply.status(400).send({ error: 'ownerId or contextId is required' });
    const canCreate = await canCreateTagForOwner(prisma, userId, ownerId);
    if (!canCreate)
      return reply.status(403).send({ error: 'No permission to create tags in this scope' });
    try {
      const tag = await prisma.tag.create({
        data: { name: body.name, ownerId },
        select: { id: true, name: true },
      });
      return reply.status(201).send(tag);
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr.code === 'P2002') {
        return reply.status(409).send({
          error: 'Tag mit diesem Namen existiert bereits in diesem Scope.',
        });
      }
      throw err;
    }
  });

  /** DELETE Tag – canCreateTagForOwner(tag.ownerId). DocumentTag wird per Cascade entfernt. */
  app.delete('/tags/:tagId', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const { tagId } = tagIdParamSchema.parse(request.params);
    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
      select: { ownerId: true },
    });
    if (!tag) return reply.status(404).send({ error: 'Tag not found' });
    const canDelete = await canCreateTagForOwner(prisma, userId, tag.ownerId);
    if (!canDelete) return reply.status(403).send({ error: 'No permission to delete this tag' });
    await prisma.tag.delete({ where: { id: tagId } });
    return reply.status(204).send();
  });

  return Promise.resolve();
};

export { documentsRoutes };
