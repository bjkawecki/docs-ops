import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
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
  canPublishDocument,
  canMergeDraftRequest,
  DOCUMENT_FOR_PERMISSION_INCLUDE,
} from '../permissions/index.js';
import { canSeeDocumentInTrash } from '../permissions/canRead.js';
import {
  canReadContext,
  canWriteContext,
  getContextOwnerId,
  canReadScopeForOwner,
  canCreateTagForOwner,
} from '../permissions/contextPermissions.js';
import { type GrantRole } from '../../generated/prisma/client.js';
import {
  getReadableCatalogScope,
  getReadableCatalogOwnerIds,
  getWritableCatalogScope,
} from '../permissions/catalogPermissions.js';
import {
  publishDocument,
  archiveDocument,
  restoreDocument,
  deleteDocument,
  updateDocumentMetadata,
  type DocumentMetadataUpdateResult,
  DocumentNotFoundError,
  DocumentNotPublishableError,
  DocumentAlreadyPublishedError,
  DocumentDeletedError,
  DocumentNotInTrashError,
  DocumentBusinessError,
} from '../services/documentService.js';
import { mergeThreeWay } from '../mergeThreeWay.js';
import {
  paginationQuerySchema,
  catalogDocumentsQuerySchema,
  contextIdParamSchema,
  documentIdParamSchema,
  versionIdParamSchema,
  attachmentIdParamSchema,
  draftRequestIdParamSchema,
  createDraftRequestBodySchema,
  putDraftBodySchema,
  patchDraftRequestBodySchema,
  draftRequestsQuerySchema,
  createDocumentBodySchema,
  updateDocumentBodySchema,
  putGrantsUsersBodySchema,
  putGrantsTeamsBodySchema,
  putGrantsDepartmentsBodySchema,
  tagIdParamSchema,
  createTagBodySchema,
  getTagsQuerySchema,
} from './schemas/documents.js';
import { enqueueJob, getJobById } from '../jobs/client.js';

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const exportPdfStatusParamsSchema = z.object({
  documentId: z.string().cuid(),
  jobId: z.string().min(1),
});

function buildPdfDownloadFilename(title: string | null | undefined, documentId: string): string {
  const raw = (title?.trim() || `document-${documentId}`).toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const base = normalized || `document-${documentId}`;
  return base.endsWith('.pdf') ? base : `${base}.pdf`;
}

const documentsRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  // Allow binary uploads for attachment route (body as Buffer).
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) =>
    done(null, body as Buffer)
  );
  app.addContentTypeParser(/^image\//, { parseAs: 'buffer' }, (_req, body, done) =>
    done(null, body as Buffer)
  );
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (_req, body, done) =>
    done(null, body as Buffer)
  );

  /** GET Catalog: all documents the user can read, with filters and pagination. */
  app.get('/documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = catalogDocumentsQuerySchema.parse(request.query);

    const [readableScope, writableScope] = await Promise.all([
      getReadableCatalogScope(prisma, userId),
      getWritableCatalogScope(prisma, userId),
    ]);
    const { contextIds, documentIdsFromGrants } = readableScope;
    const {
      contextIds: writableContextIds,
      documentIdsFromGrants: writableDocumentIdsFromGrants,
      documentIdsFromCreator: writableDocumentIdsFromCreator,
    } = writableScope;

    const readableOr: unknown[] = [
      ...(contextIds.length > 0 ? [{ contextId: { in: contextIds } }] : []),
      ...(documentIdsFromGrants.length > 0 ? [{ id: { in: documentIdsFromGrants } }] : []),
      ...(writableDocumentIdsFromCreator.length > 0
        ? [{ id: { in: writableDocumentIdsFromCreator } }]
        : []),
    ];
    if (readableOr.length === 0) {
      return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
    }

    const draftVisibleOr: unknown[] = [
      { publishedAt: { not: null } },
      ...(writableContextIds.length > 0 ? [{ contextId: { in: writableContextIds } }] : []),
      ...(writableDocumentIdsFromGrants.length > 0
        ? [{ id: { in: writableDocumentIdsFromGrants } }]
        : []),
      ...(writableDocumentIdsFromCreator.length > 0
        ? [{ id: { in: writableDocumentIdsFromCreator } }]
        : []),
    ];
    const scopeFilter = query.companyId ?? query.departmentId ?? query.teamId;
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
    const scopeContextCond =
      contextConditions.length === 1 ? contextConditions[0] : { AND: contextConditions };
    const contextNotDeletedCond = {
      OR: [
        { contextId: null },
        {
          context: {
            OR: [
              { process: { deletedAt: null } },
              { project: { deletedAt: null } },
              { subcontext: { project: { deletedAt: null } } },
            ],
          },
        },
      ],
    };
    const baseAnd: unknown[] = [
      { OR: readableOr },
      contextNotDeletedCond,
      scopeFilter != null
        ? {
            OR: [
              { publishedAt: { not: null }, context: scopeContextCond },
              { contextId: null, createdById: userId },
            ],
          }
        : { OR: draftVisibleOr },
    ];
    const baseWhere: Record<string, unknown> = {
      deletedAt: null,
      archivedAt: null,
      AND: baseAnd,
    };
    if (contextConditions.length > 0 && scopeFilter == null) {
      baseWhere.context = scopeContextCond;
    }

    if (query.tagIds.length > 0) {
      baseWhere.documentTags = { some: { tagId: { in: query.tagIds } } };
    }
    if (query.search?.trim()) {
      baseWhere.title = { contains: query.search.trim(), mode: 'insensitive' };
    }
    if (query.publishedOnly) {
      baseWhere.publishedAt = { not: null };
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
          displayName: true,
          contextType: true,
          ownerDisplayName: true,
          process: {
            select: {
              id: true,
              name: true,
              owner: {
                select: {
                  company: { select: { id: true, name: true } },
                  department: { select: { id: true, name: true } },
                  team: { select: { id: true, name: true } },
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
                  company: { select: { id: true, name: true } },
                  department: { select: { id: true, name: true } },
                  team: { select: { id: true, name: true } },
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
                      company: { select: { id: true, name: true } },
                      department: { select: { id: true, name: true } },
                      team: { select: { id: true, name: true } },
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

    const sortBy = query.sortBy ?? 'updatedAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const orderBy =
      sortBy === 'contextName'
        ? { context: { displayName: sortOrder } }
        : sortBy === 'contextType'
          ? { context: { contextType: sortOrder } }
          : sortBy === 'ownerDisplay'
            ? { context: { ownerDisplayName: sortOrder } }
            : ({ [sortBy]: sortOrder } as {
                title?: 'asc' | 'desc';
                updatedAt?: 'asc' | 'desc';
                createdAt?: 'asc' | 'desc';
              });

    const [rawItems, totalCount] = await Promise.all([
      prisma.document.findMany({
        where: baseWhere,
        select,
        orderBy,
        take: query.limit,
        skip: query.offset,
      }),
      prisma.document.count({ where: baseWhere }),
    ]);

    type ScopeInfo = {
      scopeType: 'team' | 'department' | 'company' | 'personal';
      scopeId: string | null;
      scopeName: string;
    };
    const mapDoc = (doc: (typeof rawItems)[number]) => {
      const ctx = doc.context;
      let contextType: 'process' | 'project' = 'process';
      let contextName = '';
      let ownerDisplay = 'Personal';
      let ownerHref: string | null = null;
      let contextProcessId: string | null = null;
      let contextProjectId: string | null = null;
      let scopeInfo: ScopeInfo = { scopeType: 'personal', scopeId: null, scopeName: 'Personal' };
      const getOwnerFrom = (o: {
        company: { id: string; name: string } | null;
        department: { id: string; name: string } | null;
        team: { id: string; name: string } | null;
        ownerUserId: string | null;
        ownerUser: { name: string | null } | null;
      }) => {
        ownerDisplay =
          o.company?.name ??
          o.department?.name ??
          o.team?.name ??
          (o.ownerUserId != null ? (o.ownerUser?.name ?? 'Personal') : 'Personal');
        if (o.company != null) {
          ownerHref = '/company';
          scopeInfo = { scopeType: 'company', scopeId: o.company.id, scopeName: o.company.name };
        } else if (o.department != null) {
          ownerHref = `/department/${o.department.id}`;
          scopeInfo = {
            scopeType: 'department',
            scopeId: o.department.id,
            scopeName: o.department.name,
          };
        } else if (o.team != null) {
          ownerHref = `/team/${o.team.id}`;
          scopeInfo = { scopeType: 'team', scopeId: o.team.id, scopeName: o.team.name };
        } else if (o.ownerUserId != null) {
          ownerHref = '/personal';
          scopeInfo = {
            scopeType: 'personal',
            scopeId: null,
            scopeName: o.ownerUser?.name ?? 'Personal',
          };
        }
      };
      if (!ctx) {
        contextName = 'Ungrouped';
      } else {
        contextName = ctx.displayName ?? '';
        if (ctx.contextType === 'process' || ctx.contextType === 'project')
          contextType = ctx.contextType;
        if (ctx.process) {
          if (!contextName) contextName = ctx.process.name;
          contextProcessId = ctx.process.id;
          getOwnerFrom(ctx.process.owner);
        } else if (ctx.project) {
          if (!contextName) contextName = ctx.project.name;
          contextProjectId = ctx.project.id;
          getOwnerFrom(ctx.project.owner);
        } else if (ctx.subcontext) {
          if (!contextName) contextName = ctx.subcontext.name;
          contextProjectId = ctx.subcontext.project.id;
          getOwnerFrom(ctx.subcontext.project.owner);
        } else {
          ownerDisplay = ctx.ownerDisplayName ?? 'Personal';
          scopeInfo = {
            scopeType: 'personal',
            scopeId: null,
            scopeName: ctx.ownerDisplayName ?? 'Personal',
          };
        }
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
        ownerHref,
        contextProcessId,
        contextProjectId,
        scopeType: scopeInfo.scopeType,
        scopeId: scopeInfo.scopeId,
        scopeName: scopeInfo.scopeName,
      };
    };

    const items = rawItems.map(mapDoc);

    return reply.send({
      items,
      total: totalCount,
      limit: query.limit,
      offset: query.offset,
    });
  });

  /** GET PDF download: proxy stream for internal object keys; redirect only for absolute external URLs. */
  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/pdf',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      // Allow trashed documents when user has trash read access (enforced by preHandler).
      const doc = await prisma.document.findFirst({
        where: { id: documentId },
        select: { title: true, pdfUrl: true },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      const pdfUrl = doc.pdfUrl?.trim() ?? '';
      if (!pdfUrl) return reply.status(404).send({ error: 'PDF not available' });
      if (/^https?:\/\//i.test(pdfUrl)) {
        return reply.redirect(pdfUrl, 302);
      }
      const storage = request.server.storage;
      if (!storage) return reply.status(503).send({ error: 'Storage not available' });
      const object = await storage.getObject(pdfUrl);
      if (!object) return reply.status(404).send({ error: 'PDF object not found in storage' });
      const filename = buildPdfDownloadFilename(doc.title, documentId);
      reply.header('Content-Type', object.ContentType ?? 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Cache-Control', 'private, max-age=60');
      return reply.send(object.Body);
    }
  );

  /** POST PDF export job: queue background generation and return job id for polling. */
  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/export-pdf',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);

      const jobId = await enqueueJob('documents.export.pdf', {
        documentId,
        requestedByUserId: userId,
      });

      return reply.status(202).send({
        jobId,
        status: 'queued',
      });
    }
  );

  /** GET PDF export job status incl. download URL when completed. */
  app.get<{ Params: { documentId: string; jobId: string } }>(
    '/documents/:documentId/export-pdf/:jobId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId, jobId } = exportPdfStatusParamsSchema.parse(request.params);

      const job = await getJobById('documents.export.pdf', jobId);
      if (!job) {
        return reply.status(404).send({ error: 'Export job not found' });
      }

      const payloadDocumentId =
        typeof job.data === 'object' && job.data != null && 'documentId' in job.data
          ? (job.data.documentId as string)
          : null;
      if (payloadDocumentId !== documentId) {
        return reply.status(404).send({ error: 'Export job not found for document' });
      }

      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { pdfUrl: true },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });

      const state = job.state;
      const isDone = state === 'completed';
      const responseStatus =
        state === 'created' || state === 'retry'
          ? 'queued'
          : state === 'active'
            ? 'running'
            : state === 'completed'
              ? 'succeeded'
              : state === 'failed'
                ? 'failed'
                : state === 'cancelled'
                  ? 'cancelled'
                  : state;

      return reply.send({
        jobId,
        status: responseStatus,
        state,
        completedAt: job.completedOn ?? null,
        failedAt: null,
        pdfReady: isDone && Boolean(doc.pdfUrl),
        downloadUrl: isDone && doc.pdfUrl ? `/api/v1/documents/${documentId}/pdf` : null,
        error:
          state === 'failed' && job.output && typeof job.output === 'object'
            ? 'message' in job.output
              ? (job.output.message as string)
              : 'Job failed'
            : null,
      });
    }
  );

  /** POST Upload attachment (binary body, X-Filename required). */
  app.post<{
    Params: { documentId: string };
    Body: Buffer;
  }>(
    '/documents/:documentId/attachments',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
      bodyLimit: MAX_ATTACHMENT_SIZE_BYTES,
    },
    async (request, reply) => {
      const storage = request.server.storage;
      if (!storage) return reply.status(503).send({ error: 'Storage not available' });
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const filename = (request.headers['x-filename'] as string)?.trim();
      if (!filename) return reply.status(400).send({ error: 'X-Filename header required' });
      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.status(400).send({ error: 'Binary body required' });
      }
      if (body.length > MAX_ATTACHMENT_SIZE_BYTES) {
        return reply.status(413).send({ error: 'File too large' });
      }
      const contentType = (request.headers['content-type'] as string) ?? undefined;
      const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'bin';
      const objectKey = `attachments/${documentId}/${randomUUID()}.${ext}`;
      await storage.uploadStream(objectKey, body, contentType);
      const attachment = await prisma.documentAttachment.create({
        data: {
          documentId,
          objectKey,
          filename,
          contentType: contentType || null,
          sizeBytes: body.length,
          uploadedById: userId,
        },
      });
      return reply.status(201).send({
        id: attachment.id,
        documentId: attachment.documentId,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt,
      });
    }
  );

  /** GET Attachment file: redirect to presigned URL. */
  app.get<{ Params: { documentId: string; attachmentId: string } }>(
    '/documents/:documentId/attachments/:attachmentId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const storage = request.server.storage;
      if (!storage) return reply.status(503).send({ error: 'Storage not available' });
      const prisma = request.server.prisma;
      const { documentId, attachmentId } = attachmentIdParamSchema.parse(request.params);
      const attachment = await prisma.documentAttachment.findFirst({
        where: { id: attachmentId, documentId },
      });
      if (!attachment) return reply.status(404).send({ error: 'Attachment not found' });
      const presigned = await storage.getPresignedGetUrl(attachment.objectKey, 60);
      return reply.redirect(presigned, 302);
    }
  );

  /** DELETE Attachment (object + DB). */
  app.delete<{ Params: { documentId: string; attachmentId: string } }>(
    '/documents/:documentId/attachments/:attachmentId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const storage = request.server.storage;
      if (!storage) return reply.status(503).send({ error: 'Storage not available' });
      const prisma = request.server.prisma;
      const { documentId, attachmentId } = attachmentIdParamSchema.parse(request.params);
      const attachment = await prisma.documentAttachment.findFirst({
        where: { id: attachmentId, documentId },
      });
      if (!attachment) return reply.status(404).send({ error: 'Attachment not found' });
      await storage.deleteObject(attachment.objectKey);
      await prisma.documentAttachment.delete({ where: { id: attachmentId } });
      return reply.status(204).send();
    }
  );

  /** GET Einzeldokument. Erlaubt auch gelöschte (Trash), wenn Nutzer sie im Trash sehen darf. */
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
        where: { id: documentId },
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
      const isTrashed = doc.deletedAt != null;
      if (!isTrashed && doc.publishedAt == null) {
        const writeAllowedForDraft = await canWrite(prisma, userId, doc);
        if (!writeAllowedForDraft) {
          return reply
            .status(403)
            .send({ error: 'Draft documents are only visible to users with write access' });
        }
      }
      const [writeAllowed, deleteAllowed, canPublish] = await Promise.all([
        isTrashed ? Promise.resolve(false) : canWrite(prisma, userId, doc),
        canDeleteDocument(prisma, userId, documentId),
        isTrashed ? Promise.resolve(false) : canPublishDocument(prisma, userId, documentId),
      ]);
      const ctx = doc.context;
      const owner =
        ctx?.process?.owner ?? ctx?.project?.owner ?? ctx?.subcontext?.project?.owner ?? null;
      const contextOwnerId = owner?.id ?? null;
      const scope =
        owner?.ownerUserId != null
          ? { type: 'personal' as const, name: owner.displayName }
          : owner?.companyId != null
            ? { type: 'company' as const, id: owner.companyId, name: owner.displayName }
            : owner?.departmentId != null
              ? { type: 'department' as const, id: owner.departmentId, name: owner.displayName }
              : owner?.teamId != null
                ? { type: 'team' as const, id: owner.teamId, name: owner.displayName }
                : null;

      let contextType: 'process' | 'project' = 'process';
      let contextName = '';
      let contextProcessId: string | null = null;
      let contextProjectId: string | null = null;
      let contextProjectName: string | null = null;
      let subcontextId: string | null = null;
      let subcontextName: string | null = null;
      if (!ctx) {
        contextName = 'Ungrouped';
      } else if (ctx.process) {
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
        deletedAt: doc.deletedAt?.toISOString() ?? null,
        publishedAt: doc.publishedAt,
        currentPublishedVersionId: doc.currentPublishedVersionId ?? null,
        description: doc.description,
        createdById: doc.createdById,
        createdByName: doc.createdBy?.name ?? null,
        writers,
        documentTags: doc.documentTags,
        canWrite: writeAllowed,
        canDelete: deleteAllowed,
        canPublish,
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

  /** POST Publish – Draft als Version 1 veröffentlichen. Nur canPublishDocument; nur wenn publishedAt null. */
  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/publish',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);

      const allowed = await canPublishDocument(prisma, userId, documentId);
      if (!allowed)
        return reply.status(403).send({ error: 'Permission denied to publish this document' });

      try {
        await publishDocument(prisma, documentId, userId);
        const doc = await prisma.document.findUnique({
          where: { id: documentId },
          select: {
            id: true,
            title: true,
            content: true,
            pdfUrl: true,
            contextId: true,
            createdAt: true,
            updatedAt: true,
            publishedAt: true,
            currentPublishedVersionId: true,
            description: true,
            archivedAt: true,
            createdById: true,
            createdBy: { select: { name: true } },
            documentTags: { include: { tag: { select: { id: true, name: true } } } },
          },
        });
        if (!doc)
          return reply.status(500).send({ error: 'Publish succeeded but document not found' });
        return reply.send({
          ...doc,
          createdByName: doc.createdBy?.name ?? null,
        });
      } catch (err) {
        if (err instanceof DocumentNotFoundError)
          return reply.status(404).send({ error: 'Document not found' });
        if (err instanceof DocumentNotPublishableError)
          return reply.status(400).send({ error: err.message });
        if (err instanceof DocumentAlreadyPublishedError)
          return reply.status(409).send({ error: 'Document is already published' });
        throw err;
      }
    }
  );

  /** POST Archive – Dokument archivieren (archivedAt setzen). requireDocumentAccess('write'). */
  app.post(
    '/documents/:documentId/archive',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      try {
        await archiveDocument(prisma, documentId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof DocumentNotFoundError)
          return reply.status(404).send({ error: 'Document not found' });
        if (err instanceof DocumentDeletedError)
          return reply.status(400).send({ error: 'Document is deleted' });
        throw err;
      }
    }
  );

  /** GET Versionsliste – alle Versionen des Dokuments (canRead). */
  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/versions',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);

      // Allow trashed documents when user has trash read access (enforced by preHandler).
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });

      const versions = await prisma.documentVersion.findMany({
        where: { documentId },
        orderBy: { versionNumber: 'desc' },
        select: {
          id: true,
          versionNumber: true,
          createdAt: true,
          createdById: true,
          createdBy: { select: { name: true } },
        },
      });
      const items = versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        createdById: v.createdById ?? null,
        createdByName: v.createdBy?.name ?? null,
      }));
      return reply.send({ items });
    }
  );

  /** GET Einzelversion – Inhalt einer Version (canRead auf Dokument). */
  app.get<{ Params: { documentId: string; versionId: string } }>(
    '/documents/:documentId/versions/:versionId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId, versionId } = versionIdParamSchema.parse(request.params);

      const version = await prisma.documentVersion.findFirst({
        where: { id: versionId, documentId },
        select: {
          id: true,
          documentId: true,
          content: true,
          versionNumber: true,
          createdAt: true,
          createdById: true,
          createdBy: { select: { name: true } },
        },
      });
      if (!version) return reply.status(404).send({ error: 'Version not found' });

      return reply.send({
        id: version.id,
        documentId: version.documentId,
        content: version.content,
        versionNumber: version.versionNumber,
        createdAt: version.createdAt,
        createdById: version.createdById ?? null,
        createdByName: version.createdBy?.name ?? null,
      });
    }
  );

  /** POST Update draft to latest published version (3-way merge). canWrite, published document only. */
  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/draft/update-to-latest',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);

      const doc = await prisma.document.findUnique({
        where: { id: documentId, deletedAt: null },
        select: { id: true, publishedAt: true, content: true, currentPublishedVersionId: true },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      if (doc.publishedAt == null)
        return reply
          .status(400)
          .send({ error: 'Update to latest is only for published documents' });

      const draft = await prisma.documentDraft.findUnique({
        where: { documentId_userId: { documentId, userId } },
        select: { content: true, basedOnVersionId: true },
      });
      if (!draft) return reply.status(404).send({ error: 'No draft found for this document' });

      if (draft.basedOnVersionId === doc.currentPublishedVersionId) {
        return reply.send({ upToDate: true as const });
      }

      if (doc.currentPublishedVersionId == null || draft.basedOnVersionId == null) {
        return reply.send({ upToDate: true as const });
      }

      const baseVersion = await prisma.documentVersion.findUnique({
        where: { id: draft.basedOnVersionId, documentId },
        select: { content: true },
      });
      if (!baseVersion)
        return reply.status(400).send({ error: 'Draft base version no longer exists' });

      let mergedContent: string;
      let hasConflicts: boolean;
      try {
        const result = mergeThreeWay(baseVersion.content, draft.content, doc.content);
        mergedContent = result.mergedContent;
        hasConflicts = result.hasConflicts;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({
          error: 'Merge failed',
          details: message,
        });
      }
      return reply.send({ mergedContent, hasConflicts });
    }
  );

  /** GET User's draft for document (canWrite). 404 if no draft. */
  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/draft',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);

      const draft = await prisma.documentDraft.findUnique({
        where: { documentId_userId: { documentId, userId } },
        select: {
          id: true,
          documentId: true,
          userId: true,
          content: true,
          basedOnVersionId: true,
          updatedAt: true,
        },
      });
      if (!draft) return reply.status(404).send({ error: 'No draft found for this document' });
      return reply.send(draft);
    }
  );

  /** PUT User's draft – upsert (canWrite, published document only). */
  app.put<{ Params: { documentId: string } }>(
    '/documents/:documentId/draft',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const body = putDraftBodySchema.parse(request.body);

      const doc = await prisma.document.findUnique({
        where: { id: documentId, deletedAt: null },
        select: { id: true, publishedAt: true, currentPublishedVersionId: true },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      if (doc.publishedAt == null)
        return reply.status(400).send({ error: 'Draft is only for published documents' });

      const updateData: { content: string; basedOnVersionId?: string } = { content: body.content };
      if (
        body.basedOnVersionId != null &&
        body.basedOnVersionId === doc.currentPublishedVersionId
      ) {
        updateData.basedOnVersionId = body.basedOnVersionId;
      }
      const draft = await prisma.documentDraft.upsert({
        where: { documentId_userId: { documentId, userId } },
        create: {
          documentId,
          userId,
          content: body.content,
          basedOnVersionId: doc.currentPublishedVersionId,
        },
        update: updateData,
        select: {
          id: true,
          documentId: true,
          userId: true,
          content: true,
          basedOnVersionId: true,
          updatedAt: true,
        },
      });
      return reply.send(draft);
    }
  );

  /** POST Create draft request (PR) – canWrite, published document. */
  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/draft-requests',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const body = createDraftRequestBodySchema.parse(request.body);

      const doc = await prisma.document.findUnique({
        where: { id: documentId, deletedAt: null },
        select: { id: true, publishedAt: true, currentPublishedVersionId: true },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      if (doc.publishedAt == null)
        return reply.status(400).send({ error: 'Draft requests are only for published documents' });

      const targetVersionId = body.targetVersionId ?? doc.currentPublishedVersionId;

      const draftRequest = await prisma.draftRequest.create({
        data: {
          documentId,
          draftContent: body.draftContent,
          targetVersionId,
          status: 'open',
          submittedById: userId,
        },
        select: {
          id: true,
          documentId: true,
          draftContent: true,
          targetVersionId: true,
          status: true,
          submittedById: true,
          submittedAt: true,
        },
      });
      return reply.status(201).send(draftRequest);
    }
  );

  /** GET Draft requests for document (canRead). */
  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/draft-requests',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      const query = draftRequestsQuerySchema.parse(request.query ?? {});

      // Allow trashed documents when user has trash read access (enforced by preHandler).
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });

      const where: { documentId: string; status?: 'open' | 'merged' | 'rejected' } = { documentId };
      if (query.status) where.status = query.status;

      const requests = await prisma.draftRequest.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          documentId: true,
          draftContent: true,
          targetVersionId: true,
          status: true,
          submittedById: true,
          submittedAt: true,
          mergedAt: true,
          mergedById: true,
          comment: true,
          submittedBy: { select: { name: true } },
        },
      });
      const items = requests.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        draftContent: r.draftContent,
        targetVersionId: r.targetVersionId,
        status: r.status,
        submittedById: r.submittedById,
        submittedAt: r.submittedAt,
        mergedAt: r.mergedAt ?? null,
        mergedById: r.mergedById ?? null,
        comment: r.comment ?? null,
        submittedByName: r.submittedBy.name,
      }));
      return reply.send({ items });
    }
  );

  /** PATCH Draft request – merge or reject (canMergeDraftRequest). */
  app.patch<{ Params: { draftRequestId: string } }>(
    '/draft-requests/:draftRequestId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { draftRequestId } = draftRequestIdParamSchema.parse(request.params);
      const body = patchDraftRequestBodySchema.parse(request.body);

      const canMerge = await canMergeDraftRequest(prisma, userId, draftRequestId);
      if (!canMerge)
        return reply
          .status(403)
          .send({ error: 'Permission denied to merge or reject this request' });

      const draftRequest = await prisma.draftRequest.findUnique({
        where: { id: draftRequestId },
        select: {
          id: true,
          documentId: true,
          draftContent: true,
          status: true,
          submittedById: true,
        },
      });
      if (!draftRequest) return reply.status(404).send({ error: 'Draft request not found' });
      if (draftRequest.status !== 'open')
        return reply.status(409).send({ error: 'Draft request is no longer open' });

      if (body.action === 'merge') {
        await prisma.$transaction(async (tx) => {
          const doc = await tx.document.findUnique({
            where: { id: draftRequest.documentId, deletedAt: null },
            select: { currentPublishedVersionId: true },
          });
          if (!doc) throw new Error('Document not found');

          const maxVersion = await tx.documentVersion.aggregate({
            where: { documentId: draftRequest.documentId },
            _max: { versionNumber: true },
          });
          const nextVersionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

          const newVersion = await tx.documentVersion.create({
            data: {
              documentId: draftRequest.documentId,
              content: draftRequest.draftContent,
              versionNumber: nextVersionNumber,
              parentVersionId: doc.currentPublishedVersionId,
              createdById: userId,
            },
            select: { id: true },
          });

          await tx.document.update({
            where: { id: draftRequest.documentId },
            data: {
              content: draftRequest.draftContent,
              currentPublishedVersionId: newVersion.id,
            },
          });

          await tx.draftRequest.update({
            where: { id: draftRequestId },
            data: {
              status: 'merged',
              mergedAt: new Date(),
              mergedById: userId,
              comment: body.comment ?? undefined,
            },
          });

          await tx.documentDraft.updateMany({
            where: {
              documentId: draftRequest.documentId,
              userId: draftRequest.submittedById,
            },
            data: { basedOnVersionId: newVersion.id },
          });
        });
      } else {
        await prisma.draftRequest.update({
          where: { id: draftRequestId },
          data: {
            status: 'rejected',
            mergedById: userId,
            comment: body.comment ?? undefined,
          },
        });
      }

      const updated = await prisma.draftRequest.findUnique({
        where: { id: draftRequestId },
        select: {
          id: true,
          status: true,
          mergedAt: true,
          mergedById: true,
          comment: true,
        },
      });
      return reply.send(updated);
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

      const [readAllowed, writeAllowed] = await Promise.all([
        canReadContext(prisma, userId, contextId),
        canWriteContext(prisma, userId, contextId),
      ]);
      if (!readAllowed) return reply.status(403).send({ error: 'No access to this context' });

      /** Writers see all documents (drafts + published); readers only published, so published drafts appear under Documents. */
      const documentWhere = {
        contextId,
        deletedAt: null,
        archivedAt: null,
        ...(writeAllowed ? {} : { publishedAt: { not: null } }),
      };
      const [items, total] = await Promise.all([
        prisma.document.findMany({
          where: documentWhere,
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
        prisma.document.count({ where: documentWhere }),
      ]);
      return reply.send({ items, total, limit: query.limit, offset: query.offset });
    }
  );

  /** POST Dokument anlegen – with contextId: canWriteContext; without: context-free draft (creator only). */
  app.post('/documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const body = createDocumentBodySchema.parse(request.body);
    const content = body.content.trim() === '' ? `# ${body.title}\n\n` : body.content;

    if (body.contextId == null) {
      const doc = await prisma.document.create({
        data: {
          title: body.title,
          content,
          contextId: null,
          description: body.description ?? null,
          publishedAt: null,
          createdById: userId,
        },
      });
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
    }

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
        content,
        contextId: body.contextId,
        description: body.description ?? null,
        publishedAt: null,
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

  /** PATCH Dokument – nur Metadaten (title, content, contextId, description, tagIds). Lifecycle über dedizierte Endpoints. */
  app.patch(
    '/documents/:documentId',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const body = updateDocumentBodySchema.parse(request.body);

      if (body.contextId !== undefined && body.contextId !== null) {
        const ctx = await prisma.context.findUnique({
          where: { id: body.contextId },
          select: { id: true },
        });
        if (!ctx) return reply.status(404).send({ error: 'Context not found' });
        const allowed = await canWriteContext(prisma, userId, body.contextId);
        if (!allowed)
          return reply
            .status(403)
            .send({ error: 'Permission denied to assign document to this context' });
      }

      if (body.tagIds !== undefined && body.tagIds.length > 0) {
        const doc = await prisma.document.findUnique({
          where: { id: documentId },
          select: { contextId: true },
        });
        if (!doc) return reply.status(404).send({ error: 'Document not found' });
        if (doc.contextId == null)
          return reply
            .status(400)
            .send({ error: 'Document has no context; tags require a context' });
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

      try {
        const doc: DocumentMetadataUpdateResult = await updateDocumentMetadata(prisma, documentId, {
          title: body.title,
          content: body.content,
          contextId: body.contextId,
          description: body.description,
          tagIds: body.tagIds,
        });
        return reply.send({
          ...doc,
          createdByName: doc.createdBy?.name ?? null,
          writers: { users: [], teams: [], departments: [] },
        });
      } catch (err) {
        if (err instanceof DocumentNotFoundError)
          return reply.status(404).send({ error: 'Document not found' });
        if (err instanceof DocumentBusinessError)
          return reply.status(400).send({ error: err.message });
        throw err;
      }
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
      await deleteDocument(prisma, documentId);
      return reply.status(204).send();
    }
  );

  /** POST Dokument aus Papierkorb wiederherstellen. Wenn Kontext trashed: Abkoppeln (contextId = null) als Draft; sonst nur deletedAt = null. */
  app.post(
    '/documents/:documentId/restore',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        include: DOCUMENT_FOR_PERMISSION_INCLUDE,
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      if (doc.deletedAt == null) {
        return reply.status(400).send({ error: 'Not in trash' });
      }
      const allowed =
        (await canDeleteDocument(prisma, userId, documentId)) ||
        (await canSeeDocumentInTrash(prisma, userId, doc));
      if (!allowed) {
        return reply.status(403).send({ error: 'Permission denied to restore this document' });
      }
      try {
        await restoreDocument(prisma, documentId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof DocumentNotFoundError)
          return reply.status(404).send({ error: 'Document not found' });
        if (err instanceof DocumentNotInTrashError)
          return reply.status(400).send({ error: 'Not in trash' });
        throw err;
      }
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

  /** GET Tags for catalog filter – all tags from scopes the user can read in the catalog. */
  app.get('/tags/catalog', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const ownerIds = await getReadableCatalogOwnerIds(prisma, userId);
    if (ownerIds.length === 0) return reply.send([]);
    const tags = await prisma.tag.findMany({
      where: { ownerId: { in: ownerIds } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return reply.send(tags);
  });

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

    const existing = await prisma.tag.findUnique({
      where: { ownerId_name: { ownerId, name: body.name } },
      select: { id: true },
    });
    if (existing)
      return reply.status(409).send({
        error: 'Tag mit diesem Namen existiert bereits in diesem Scope.',
      });

    const tag = await prisma.tag.create({
      data: { name: body.name, ownerId },
      select: { id: true, name: true },
    });
    return reply.status(201).send(tag);
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
