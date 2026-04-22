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
  canModerateDocumentComments,
  canReadLeadDraft,
  canEditLeadDraft,
  canCreateSuggestion,
  canReadSuggestions,
  canResolveSuggestion,
  DOCUMENT_FOR_PERMISSION_INCLUDE,
} from '../permissions/index.js';
import { canSeeDocumentInTrash, loadDocument } from '../permissions/canRead.js';
import {
  canReadContext,
  canWriteContext,
  getContextOwnerId,
  canReadScopeForOwner,
  canCreateTagForOwner,
} from '../permissions/contextPermissions.js';
import { Prisma, type GrantRole } from '../../generated/prisma/client.js';
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
} from '../services/documents/documentService.js';
import {
  emptyBlockDocumentJson,
  parseBlockDocumentFromDb,
} from '../services/documents/documentBlocksBackfill.js';
import { documentMarkdownFromRow } from '../services/documents/documentMarkdownSnapshot.js';
import { blockDocumentV0ToMarkdown } from '../services/documents/blocksToMarkdown.js';
import { getLeadDraftForUser, patchLeadDraft } from '../services/documents/leadDraftService.js';
import {
  acceptDocumentSuggestion,
  createDocumentSuggestion,
  listDocumentSuggestions,
  rejectDocumentSuggestion,
  LeadDraftNotInitializedError,
  StaleSuggestionError,
  SuggestionForbiddenError,
  SuggestionInvalidStateError,
  SuggestionNotFoundError,
  SuggestionOpsValidationError,
  SuggestionParentDocumentNotFoundError,
  withdrawDocumentSuggestion,
} from '../services/documents/documentSuggestionService.js';
import { buildCatalogDocumentListBase } from '../services/documents/catalogDocumentListWhere.js';
import { searchDocumentsForUser } from '../services/search/documentSearchService.js';
import {
  createDocumentComment,
  deleteDocumentComment,
  listDocumentComments,
  updateDocumentComment,
} from '../services/documents/documentCommentService.js';
import {
  paginationQuerySchema,
  catalogDocumentsQuerySchema,
  contextIdParamSchema,
  documentIdParamSchema,
  versionIdParamSchema,
  attachmentIdParamSchema,
  createDocumentBodySchema,
  updateDocumentBodySchema,
  patchLeadDraftBodySchema,
  listDocumentSuggestionsQuerySchema,
  createDocumentSuggestionBodySchema,
  resolveDocumentSuggestionBodySchema,
  suggestionIdParamSchema,
  putGrantsUsersBodySchema,
  putGrantsTeamsBodySchema,
  putGrantsDepartmentsBodySchema,
  tagIdParamSchema,
  createTagBodySchema,
  getTagsQuerySchema,
  documentCommentIdParamSchema,
  createDocumentCommentBodySchema,
  patchDocumentCommentBodySchema,
} from './schemas/documents.js';
import { enqueueJob, getJobById } from '../jobs/client.js';
import {
  chunkUserIdsForNotificationJobs,
  excludeUserIds,
  listUserIdsWhoCanReadDocument,
  listUserIdsWhoCanReadOrWriteDocument,
  listUserIdsWhoCanWriteContext,
  listUserIdsWhoCanWriteDocument,
  symmetricDiffUserIds,
} from '../services/notifications/notificationRecipients.js';

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const QUEUE_RETRY_AFTER_SECONDS = 15;
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

async function enqueueIncrementalReindexForDocument(args: {
  documentId: string;
  contextId?: string | null;
  trigger: 'document-created' | 'document-updated' | 'document-deleted' | 'manual';
}): Promise<void> {
  await enqueueJob('search.reindex.incremental', {
    documentId: args.documentId,
    contextId: args.contextId ?? undefined,
    trigger: args.trigger,
  });
}

async function enqueueNotificationEvent(args: {
  eventType: string;
  targetUserIds: string[];
  payload: Record<string, unknown>;
}): Promise<void> {
  const chunks =
    args.targetUserIds.length === 0 ? [] : chunkUserIdsForNotificationJobs(args.targetUserIds);
  for (const targetUserIds of chunks) {
    await enqueueJob('notifications.send', {
      eventType: args.eventType,
      targetUserIds,
      payload: args.payload,
    });
  }
}

function sortedTagIdsSignature(tags: readonly { tagId?: string; tag?: { id: string } }[]): string {
  const ids = tags
    .map((t) => t.tag?.id ?? t.tagId)
    .filter((id): id is string => id != null && id !== '');
  return [...new Set(ids)].sort().join(',');
}

function patchTouchesReaderVisibleFields(body: z.infer<typeof updateDocumentBodySchema>): boolean {
  return (
    body.title !== undefined ||
    body.description !== undefined ||
    body.contextId !== undefined ||
    body.tagIds !== undefined
  );
}

async function enqueueDocumentGrantsChangedNotifications(args: {
  prisma: FastifyInstance['prisma'];
  documentId: string;
  actorUserId: string;
  beforeUnion: Set<string>;
}): Promise<void> {
  const { prisma, documentId, actorUserId, beforeUnion } = args;
  const afterRead = await listUserIdsWhoCanReadDocument(prisma, documentId);
  const afterWrite = await listUserIdsWhoCanWriteDocument(prisma, documentId);
  const afterUnion = new Set<string>([...afterRead, ...afterWrite]);
  const changed = symmetricDiffUserIds(beforeUnion, afterUnion);
  const targets = excludeUserIds(changed, actorUserId);
  if (targets.length === 0) return;
  await enqueueNotificationEvent({
    eventType: 'document-grants-changed',
    targetUserIds: targets,
    payload: { documentId, changedByUserId: actorUserId },
  });
}

function readerVisibleContentChanged(args: {
  before: {
    title: string;
    description: string | null;
    contextId: string | null;
    documentTags: { tagId: string }[];
  };
  body: z.infer<typeof updateDocumentBodySchema>;
  after: DocumentMetadataUpdateResult;
}): boolean {
  const { before, body, after } = args;
  if (body.title !== undefined && body.title !== before.title) return true;
  if (body.description !== undefined && (before.description ?? null) !== (body.description ?? null))
    return true;
  if (body.contextId !== undefined && (before.contextId ?? null) !== (body.contextId ?? null))
    return true;
  if (body.tagIds !== undefined) {
    const beforeSig = sortedTagIdsSignature(before.documentTags);
    const afterSig = sortedTagIdsSignature(after.documentTags.map((dt) => ({ tag: dt.tag })));
    if (beforeSig !== afterSig) return true;
  }
  return false;
}

async function findIndexedDocumentIds(
  prisma: FastifyInstance['prisma'],
  term: string
): Promise<string[]> {
  const prefixTokens = term
    .split(/\s+/)
    .map((part) => part.trim().toLowerCase())
    .map((part) => part.replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter((part) => part.length > 1);
  const prefixTsQuery =
    prefixTokens.length > 0 ? prefixTokens.map((token) => `${token}:*`).join(' & ') : null;

  const rows = await prisma.$queryRaw<Array<{ document_id: string }>>(Prisma.sql`
    SELECT document_id
    FROM document_search_index
    WHERE
      searchable @@ websearch_to_tsquery('simple', ${term})
      OR (${prefixTsQuery != null ? Prisma.sql`searchable @@ to_tsquery('simple', ${prefixTsQuery})` : Prisma.sql`FALSE`})
      OR similarity(lower(title), lower(${term})) >= 0.3
    LIMIT 5000
  `);
  return rows.map((row) => row.document_id);
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

    const catalogBase = buildCatalogDocumentListBase(readableScope, writableScope, userId, {
      contextType: query.contextType,
      companyId: query.companyId,
      departmentId: query.departmentId,
      teamId: query.teamId,
    });
    if (catalogBase == null) {
      return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
    }
    const { baseAnd, baseWhere } = catalogBase;

    if (query.tagIds.length > 0) {
      baseWhere.documentTags = { some: { tagId: { in: query.tagIds } } };
    }
    let rankedSearchOrder: string[] | null = null;
    let rankedSearchTotal: number | null = null;
    let searchMetaById = new Map<string, { rank: number; snippet: string | null }>();
    const isRelevanceSort = query.sortBy === 'relevance';
    if (query.search?.trim()) {
      const term = query.search.trim();
      try {
        if (isRelevanceSort) {
          const searchResult = await searchDocumentsForUser(prisma, userId, {
            query: term,
            limit: query.limit,
            offset: query.offset,
            contextType: query.contextType,
            companyId: query.companyId,
            departmentId: query.departmentId,
            teamId: query.teamId,
            tagIds: query.tagIds,
            publishedOnly: query.publishedOnly,
          });
          rankedSearchOrder = searchResult.items.map((item) => item.id);
          rankedSearchTotal = searchResult.total;
          searchMetaById = new Map(
            searchResult.items.map((item) => [item.id, { rank: item.rank, snippet: item.snippet }])
          );
          if (rankedSearchOrder.length === 0) {
            return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
          }
          baseAnd.push({ id: { in: rankedSearchOrder } });
        } else {
          const indexedIds = await findIndexedDocumentIds(prisma, term);
          if (indexedIds.length === 0) {
            return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
          }
          baseAnd.push({ id: { in: indexedIds } });
        }
      } catch (error) {
        rankedSearchOrder = null;
        rankedSearchTotal = null;
        searchMetaById = new Map();
        request.log.warn(
          { error },
          'Search index unavailable, falling back to document content scan'
        );
        baseAnd.push({
          OR: [{ title: { contains: term, mode: 'insensitive' } }],
        });
      }
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
      publishedAt: true,
      currentPublishedVersion: {
        select: {
          versionNumber: true,
        },
      },
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
            : sortBy === 'relevance'
              ? { updatedAt: 'desc' as const }
              : ({ [sortBy]: sortOrder } as {
                  title?: 'asc' | 'desc';
                  updatedAt?: 'asc' | 'desc';
                  createdAt?: 'asc' | 'desc';
                });

    const fetchCatalogRows = (args?: { useOrderBy?: boolean; take?: number; skip?: number }) =>
      prisma.document.findMany({
        where: baseWhere,
        select,
        ...(args?.useOrderBy ? { orderBy } : {}),
        ...(args?.take !== undefined ? { take: args.take } : {}),
        ...(args?.skip !== undefined ? { skip: args.skip } : {}),
      });

    let rawItems: Awaited<ReturnType<typeof fetchCatalogRows>> = [];
    let totalCount = 0;
    if (rankedSearchOrder != null) {
      rawItems = await fetchCatalogRows();
      const orderIndexById = new Map(rankedSearchOrder.map((id, index) => [id, index]));
      rawItems.sort(
        (a, b) =>
          (orderIndexById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndexById.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
      totalCount = rankedSearchTotal ?? rawItems.length;
    } else {
      const [normalItems, normalTotalCount] = await Promise.all([
        fetchCatalogRows({ useOrderBy: true, take: query.limit, skip: query.offset }),
        prisma.document.count({ where: baseWhere }),
      ]);
      rawItems = normalItems;
      totalCount = normalTotalCount;
    }

    type ScopeInfo = {
      scopeType: 'team' | 'department' | 'company' | 'personal';
      scopeId: string | null;
      scopeName: string;
    };
    const mapDoc = (doc: Awaited<ReturnType<typeof fetchCatalogRows>>[number]) => {
      const ctx = doc.context;
      let contextType: 'process' | 'project' | 'subcontext' = 'process';
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
        if (ctx.process) {
          contextType = 'process';
          if (!contextName) contextName = ctx.process.name;
          contextProcessId = ctx.process.id;
          getOwnerFrom(ctx.process.owner);
        } else if (ctx.project) {
          contextType = 'project';
          if (!contextName) contextName = ctx.project.name;
          contextProjectId = ctx.project.id;
          getOwnerFrom(ctx.project.owner);
        } else if (ctx.subcontext) {
          contextType = 'subcontext';
          if (!contextName) contextName = ctx.subcontext.name;
          contextProjectId = ctx.subcontext.project.id;
          getOwnerFrom(ctx.subcontext.project.owner);
        } else {
          if (ctx.contextType === 'process' || ctx.contextType === 'project') {
            contextType = ctx.contextType;
          }
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
        currentPublishedVersionNumber:
          doc.publishedAt != null ? (doc.currentPublishedVersion?.versionNumber ?? null) : null,
        scopeType: scopeInfo.scopeType,
        scopeId: scopeInfo.scopeId,
        scopeName: scopeInfo.scopeName,
        searchRank: searchMetaById.get(doc.id)?.rank ?? null,
        searchSnippet: searchMetaById.get(doc.id)?.snippet ?? null,
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
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
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

      let jobId: string;
      try {
        jobId = await enqueueJob('documents.export.pdf', {
          documentId,
          requestedByUserId: userId,
        });
      } catch (error) {
        request.log.warn(
          { error, documentId, userId },
          'Queue unavailable while starting PDF export job'
        );
        return reply.header('Retry-After', String(QUEUE_RETRY_AFTER_SECONDS)).status(503).send({
          error: 'Queue/worker currently unavailable. Please retry shortly.',
          code: 'QUEUE_UNAVAILABLE',
        });
      }

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
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
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
          currentPublishedVersion: {
            select: { versionNumber: true, blocks: true, blocksSchemaVersion: true },
          },
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
      const [writeAllowed, deleteAllowed, canPublish, canModerateComments] = await Promise.all([
        isTrashed ? Promise.resolve(false) : canWrite(prisma, userId, doc),
        canDeleteDocument(prisma, userId, documentId),
        isTrashed ? Promise.resolve(false) : canPublishDocument(prisma, userId, documentId),
        isTrashed ? Promise.resolve(false) : canModerateDocumentComments(prisma, userId, doc),
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

      let contextType: 'process' | 'project' | 'subcontext' = 'process';
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
        contextType = 'subcontext';
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
        content: documentMarkdownFromRow({
          publishedAt: doc.publishedAt,
          draftBlocks: doc.draftBlocks,
          currentPublishedVersion: doc.currentPublishedVersion,
        }),
        draftRevision: doc.draftRevision,
        blocks: parseBlockDocumentFromDb(doc.draftBlocks),
        publishedBlocks: parseBlockDocumentFromDb(doc.currentPublishedVersion?.blocks ?? null),
        publishedBlocksSchemaVersion: doc.currentPublishedVersion?.blocksSchemaVersion ?? null,
        pdfUrl: doc.pdfUrl,
        contextId: doc.contextId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        deletedAt: doc.deletedAt?.toISOString() ?? null,
        publishedAt: doc.publishedAt,
        currentPublishedVersionId: doc.currentPublishedVersionId ?? null,
        currentPublishedVersionNumber:
          doc.publishedAt != null ? (doc.currentPublishedVersion?.versionNumber ?? null) : null,
        description: doc.description,
        createdById: doc.createdById,
        createdByName: doc.createdBy?.name ?? null,
        writers,
        documentTags: doc.documentTags,
        canWrite: writeAllowed,
        canDelete: deleteAllowed,
        canPublish,
        canModerateComments,
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
            draftBlocks: true,
            publishedAt: true,
            pdfUrl: true,
            contextId: true,
            createdAt: true,
            updatedAt: true,
            currentPublishedVersionId: true,
            currentPublishedVersion: { select: { blocks: true } },
            description: true,
            archivedAt: true,
            createdById: true,
            createdBy: { select: { name: true } },
            documentTags: { include: { tag: { select: { id: true, name: true } } } },
          },
        });
        if (!doc)
          return reply.status(500).send({ error: 'Publish succeeded but document not found' });
        try {
          await enqueueIncrementalReindexForDocument({
            documentId,
            contextId: doc.contextId,
            trigger: 'document-updated',
          });
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue reindex job after document publish'
          );
        }
        try {
          const readerIds = excludeUserIds(
            await listUserIdsWhoCanReadDocument(prisma, documentId),
            userId
          );
          await enqueueNotificationEvent({
            eventType: 'document-published',
            targetUserIds: readerIds,
            payload: { documentId, contextId: doc.contextId, publishedByUserId: userId },
          });
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue notification job after document publish'
          );
        }
        return reply.send({
          ...doc,
          content: documentMarkdownFromRow({
            publishedAt: doc.publishedAt,
            draftBlocks: doc.draftBlocks,
            currentPublishedVersion: doc.currentPublishedVersion,
          }),
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
        try {
          await enqueueIncrementalReindexForDocument({
            documentId,
            trigger: 'document-updated',
          });
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue reindex job after document archive'
          );
        }
        try {
          const actorId = getEffectiveUserId(request as RequestWithUser);
          const readerIds = excludeUserIds(
            await listUserIdsWhoCanReadDocument(prisma, documentId),
            actorId
          );
          await enqueueNotificationEvent({
            eventType: 'document-archived',
            targetUserIds: readerIds,
            payload: { documentId, archivedByUserId: actorId },
          });
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue notification job after document archive'
          );
        }
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

  /** GET Versionsliste – nur für Nutzer mit Schreibrecht am Dokument. */
  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/versions',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
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

  /** GET Einzelversion – nur für Nutzer mit Schreibrecht am Dokument. */
  app.get<{ Params: { documentId: string; versionId: string } }>(
    '/documents/:documentId/versions/:versionId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId, versionId } = versionIdParamSchema.parse(request.params);

      const version = await prisma.documentVersion.findFirst({
        where: { id: versionId, documentId },
        select: {
          id: true,
          documentId: true,
          blocks: true,
          blocksSchemaVersion: true,
          versionNumber: true,
          createdAt: true,
          createdById: true,
          createdBy: { select: { name: true } },
        },
      });
      if (!version) return reply.status(404).send({ error: 'Version not found' });

      const versionBlocks = parseBlockDocumentFromDb(version.blocks);
      return reply.send({
        id: version.id,
        documentId: version.documentId,
        content: versionBlocks ? blockDocumentV0ToMarkdown(versionBlocks) : '',
        blocks: versionBlocks,
        blocksSchemaVersion: version.blocksSchemaVersion ?? null,
        versionNumber: version.versionNumber,
        createdAt: version.createdAt,
        createdById: version.createdById ?? null,
        createdByName: version.createdBy?.name ?? null,
      });
    }
  );

  /**
   * GET gemeinsamer Lead-Draft (Block-JSON). Nicht für reine Leser ohne Write/Lead (403).
   */
  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/lead-draft',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);

      const [canReadLead, canEdit] = await Promise.all([
        canReadLeadDraft(prisma, userId, documentId),
        canEditLeadDraft(prisma, userId, documentId),
      ]);

      const result = await getLeadDraftForUser(prisma, documentId, {
        canReadLead,
        canEdit,
      });

      if (!result.ok) {
        if (result.error === 'forbidden') {
          return reply.status(403).send({ error: 'Kein Zugriff auf den Lead-Draft.' });
        }
        return reply.status(404).send({ error: 'Document not found' });
      }

      reply.header('ETag', `"${result.view.draftRevision}"`);
      return reply.send({
        draftRevision: result.view.draftRevision,
        blocks: result.view.blocks,
        canEdit: result.view.canEdit,
      });
    }
  );

  /** PATCH Lead-Draft – nur Scope-Lead (wie Publish); `expectedRevision` + optional konsistentes If-Match. */
  app.patch<{ Params: { documentId: string } }>(
    '/documents/:documentId/lead-draft',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);

      const canEdit = await canEditLeadDraft(prisma, userId, documentId);
      if (!canEdit) {
        return reply.status(403).send({ error: 'Nur der Scope-Lead darf den Lead-Draft ändern.' });
      }

      const body = patchLeadDraftBodySchema.parse(request.body);
      const ifMatchRaw = request.headers['if-match'];
      if (typeof ifMatchRaw === 'string' && ifMatchRaw.trim() !== '') {
        const stripped = ifMatchRaw
          .trim()
          .replace(/^W\//i, '')
          .replace(/^["']|["']$/g, '');
        const tagRev = Number.parseInt(stripped, 10);
        if (!Number.isNaN(tagRev) && tagRev !== body.expectedRevision) {
          return reply.status(400).send({
            error: 'If-Match und expectedRevision widersprechen sich.',
          });
        }
      }

      const patchResult = await patchLeadDraft(prisma, documentId, {
        blocks: body.blocks,
        expectedRevision: body.expectedRevision,
      });

      if (!patchResult.ok) {
        if (patchResult.error === 'not_found') {
          return reply.status(404).send({ error: 'Document not found' });
        }
        if (patchResult.error === 'validation') {
          return reply.status(400).send({
            error: 'Ungültige Blocks',
            details: patchResult.issues,
          });
        }
        return reply.status(409).send({
          error: 'Lead-Draft wurde zwischenzeitlich geändert.',
          code: 'DRAFT_REVISION_CONFLICT',
        });
      }

      reply.header('ETag', `"${patchResult.draftRevision}"`);
      return reply.send({
        draftRevision: patchResult.draftRevision,
        blocks: patchResult.blocks,
        canEdit: true,
      });
    }
  );

  function serializeDocumentSuggestion(row: {
    id: string;
    documentId: string;
    authorId: string;
    status: string;
    baseDraftRevision: number;
    publishedVersionId: string | null;
    ops: unknown;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
    resolvedById: string | null;
    comment: string | null;
    author?: { id: string; name: string | null } | null;
    resolvedBy?: { id: string; name: string | null } | null;
  }) {
    return {
      id: row.id,
      documentId: row.documentId,
      authorId: row.authorId,
      authorName: row.author?.name ?? null,
      status: row.status,
      baseDraftRevision: row.baseDraftRevision,
      publishedVersionId: row.publishedVersionId,
      ops: row.ops,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      resolvedAt: row.resolvedAt,
      resolvedById: row.resolvedById,
      resolvedByName: row.resolvedBy?.name ?? null,
      comment: row.comment,
    };
  }

  /** GET Suggestions (EPIC-5): nur Writer/Lead wie Lead-Draft-Lesen. */
  app.get<{ Params: { documentId: string }; Querystring: Record<string, string | undefined> }>(
    '/documents/:documentId/suggestions',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const query = listDocumentSuggestionsQuerySchema.parse(request.query ?? {});

      const allowed = await canReadSuggestions(prisma, userId, documentId);
      if (!allowed) {
        return reply
          .status(403)
          .send({ error: 'Kein Zugriff auf Suggestions für dieses Dokument.' });
      }

      const rows = await listDocumentSuggestions(prisma, documentId, {
        status: query.status,
      });
      return reply.send(rows.map(serializeDocumentSuggestion));
    }
  );

  /** POST Suggestion anlegen (Autor, Schreibrecht). */
  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/suggestions',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);

      const allowed = await canCreateSuggestion(prisma, userId, documentId);
      if (!allowed) {
        return reply.status(403).send({ error: 'Nur Schreibende können Suggestions anlegen.' });
      }

      const body = createDocumentSuggestionBodySchema.parse(request.body);
      try {
        const row = await createDocumentSuggestion(prisma, documentId, userId, {
          baseDraftRevision: body.baseDraftRevision,
          ops: body.ops,
          publishedVersionId: body.publishedVersionId,
        });
        return reply.status(201).send(serializeDocumentSuggestion(row));
      } catch (err) {
        if (err instanceof SuggestionParentDocumentNotFoundError) {
          return reply.status(404).send({ error: 'Document not found' });
        }
        if (err instanceof StaleSuggestionError) {
          return reply.status(409).send({
            error: 'Lead-Draft-Revision passt nicht (Vorschlag veraltet).',
            code: 'stale_suggestion',
          });
        }
        if (err instanceof SuggestionOpsValidationError) {
          return reply.status(400).send({
            error: err.message,
            details: err.issues,
          });
        }
        throw err;
      }
    }
  );

  /** POST Suggestion zurückziehen (Autor, nur pending). */
  app.post<{ Params: { documentId: string; suggestionId: string } }>(
    '/documents/:documentId/suggestions/:suggestionId/withdraw',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId, suggestionId } = suggestionIdParamSchema.parse(request.params);

      const allowed = await canCreateSuggestion(prisma, userId, documentId);
      if (!allowed) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      try {
        const row = await withdrawDocumentSuggestion(prisma, documentId, suggestionId, userId);
        return reply.send(serializeDocumentSuggestion(row));
      } catch (err) {
        if (err instanceof SuggestionNotFoundError) {
          return reply.status(404).send({ error: 'Suggestion not found' });
        }
        if (err instanceof SuggestionForbiddenError) {
          return reply.status(403).send({ error: err.message });
        }
        if (err instanceof SuggestionInvalidStateError) {
          return reply.status(400).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  /** POST Suggestion annehmen (Lead): Ops auf Lead-Draft anwenden, Revision erhöhen. */
  app.post<{ Params: { documentId: string; suggestionId: string } }>(
    '/documents/:documentId/suggestions/:suggestionId/accept',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId, suggestionId } = suggestionIdParamSchema.parse(request.params);

      const allowed = await canResolveSuggestion(prisma, userId, documentId);
      if (!allowed) {
        return reply.status(403).send({ error: 'Nur der Scope-Lead kann Suggestions annehmen.' });
      }

      const body = resolveDocumentSuggestionBodySchema.parse(request.body ?? {});
      try {
        const result = await acceptDocumentSuggestion(
          prisma,
          documentId,
          suggestionId,
          userId,
          body
        );
        reply.header('ETag', `"${result.draftRevision}"`);
        return reply.send({
          suggestion: serializeDocumentSuggestion(result.suggestion),
          draftRevision: result.draftRevision,
          blocks: result.blocks,
        });
      } catch (err) {
        if (err instanceof SuggestionNotFoundError) {
          return reply.status(404).send({ error: 'Suggestion not found' });
        }
        if (err instanceof StaleSuggestionError) {
          return reply.status(409).send({
            error: 'Suggestion oder Lead-Draft wurde zwischenzeitlich geändert.',
            code: 'stale_suggestion',
          });
        }
        if (err instanceof SuggestionInvalidStateError) {
          return reply.status(400).send({ error: err.message });
        }
        if (err instanceof SuggestionOpsValidationError) {
          return reply.status(400).send({ error: err.message, details: err.issues });
        }
        if (err instanceof LeadDraftNotInitializedError) {
          return reply.status(400).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  /** POST Suggestion ablehnen (Lead). */
  app.post<{ Params: { documentId: string; suggestionId: string } }>(
    '/documents/:documentId/suggestions/:suggestionId/reject',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId, suggestionId } = suggestionIdParamSchema.parse(request.params);

      const allowed = await canResolveSuggestion(prisma, userId, documentId);
      if (!allowed) {
        return reply.status(403).send({ error: 'Nur der Scope-Lead kann Suggestions ablehnen.' });
      }

      const body = resolveDocumentSuggestionBodySchema.parse(request.body ?? {});
      try {
        const row = await rejectDocumentSuggestion(prisma, documentId, suggestionId, userId, body);
        return reply.send(serializeDocumentSuggestion(row));
      } catch (err) {
        if (err instanceof SuggestionNotFoundError) {
          return reply.status(404).send({ error: 'Suggestion not found' });
        }
        if (err instanceof SuggestionInvalidStateError) {
          return reply.status(400).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  /** GET Document comments (canRead). Top-level only (parentId null); pagination. */
  app.get<{ Params: { documentId: string }; Querystring: Record<string, string | undefined> }>(
    '/documents/:documentId/comments',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const query = paginationQuerySchema.parse(request.query ?? {});
      const doc = await loadDocument(prisma, documentId);
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      const canModerate = await canModerateDocumentComments(prisma, userId, doc);
      const { items, total } = await listDocumentComments(prisma, documentId, {
        limit: query.limit,
        offset: query.offset,
      });
      const serialize = (c: (typeof items)[number]['replies'][number] | (typeof items)[number]) => {
        const removed = c.deletedAt != null;
        return {
          id: c.id,
          documentId: c.documentId,
          authorId: c.authorId,
          authorName: c.authorName,
          text: removed ? '' : c.text,
          parentId: c.parentId,
          anchorHeadingId: c.anchorHeadingId,
          deletedAt: c.deletedAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          canDelete: removed ? false : c.authorId === userId || canModerate,
        };
      };
      return reply.send({
        items: items.map((root) => ({
          ...serialize(root),
          replies: root.replies.map((r) => serialize(r)),
        })),
        total,
        limit: query.limit,
        offset: query.offset,
      });
    }
  );

  /** POST Document comment (canRead). */
  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/comments',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const parsed = createDocumentCommentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid body',
          details: parsed.error.flatten(),
        });
      }
      const docRow = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          title: true,
          publishedAt: true,
          draftBlocks: true,
          currentPublishedVersion: { select: { blocks: true } },
        },
      });
      if (!docRow) return reply.status(404).send({ error: 'Document not found' });
      const mdSnapshot = documentMarkdownFromRow({
        publishedAt: docRow.publishedAt,
        draftBlocks: docRow.draftBlocks,
        currentPublishedVersion: docRow.currentPublishedVersion,
      });
      const created = await createDocumentComment(prisma, {
        documentId,
        authorId: userId,
        text: parsed.data.text,
        parentId: parsed.data.parentId,
        anchorHeadingId: parsed.data.anchorHeadingId,
        documentContent: mdSnapshot,
      });
      if (!created.ok) {
        if (created.error === 'parent_not_found') {
          return reply.status(404).send({ error: 'Comment thread not found' });
        }
        if (created.error === 'invalid_parent') {
          return reply.status(400).send({ error: 'You can only reply to a top-level comment' });
        }
        if (created.error === 'parent_deleted') {
          return reply.status(400).send({ error: 'Cannot reply to a removed comment' });
        }
        return reply.status(400).send({ error: 'Invalid section anchor' });
      }
      const row = created.comment;
      try {
        const readerIds = excludeUserIds(
          await listUserIdsWhoCanReadDocument(prisma, documentId),
          userId
        );
        await enqueueNotificationEvent({
          eventType: 'document-comment-created',
          targetUserIds: readerIds,
          payload: {
            documentId,
            commentId: row.id,
            parentId: row.parentId,
            authorUserId: userId,
            documentTitle: docRow.title,
            commentPreview: row.text.slice(0, 200),
          },
        });
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to enqueue notification job after document comment'
        );
      }
      return reply.status(201).send({
        id: row.id,
        documentId: row.documentId,
        authorId: row.authorId,
        authorName: row.authorName,
        text: row.text,
        parentId: row.parentId,
        anchorHeadingId: row.anchorHeadingId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt?.toISOString() ?? null,
        canDelete: true,
        replies: row.parentId == null ? [] : undefined,
      });
    }
  );

  /** PATCH Document comment – author only (canRead). */
  app.patch<{ Params: { documentId: string; commentId: string } }>(
    '/documents/:documentId/comments/:commentId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId, commentId } = documentCommentIdParamSchema.parse(request.params);
      const body = patchDocumentCommentBodySchema.parse(request.body);
      const docRow = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          publishedAt: true,
          draftBlocks: true,
          currentPublishedVersion: { select: { blocks: true } },
        },
      });
      if (!docRow) return reply.status(404).send({ error: 'Document not found' });
      const mdSnapshot = documentMarkdownFromRow({
        publishedAt: docRow.publishedAt,
        draftBlocks: docRow.draftBlocks,
        currentPublishedVersion: docRow.currentPublishedVersion,
      });
      const result = await updateDocumentComment(prisma, {
        documentId,
        commentId,
        userId,
        text: body.text,
        anchorHeadingId: body.anchorHeadingId,
        documentContent: mdSnapshot,
      });
      if (!result.ok) {
        if (result.error === 'not_found')
          return reply.status(404).send({ error: 'Comment not found' });
        if (result.error === 'forbidden')
          return reply.status(403).send({ error: 'You can only edit your own comments' });
        if (result.error === 'deleted') {
          return reply.status(400).send({ error: 'This comment was removed' });
        }
        if (result.error === 'anchor_only_on_root') {
          return reply
            .status(400)
            .send({ error: 'Section anchor can only be set on top-level comments' });
        }
        return reply.status(400).send({ error: 'Invalid section anchor' });
      }
      const doc = await loadDocument(prisma, documentId);
      const canModerate = doc ? await canModerateDocumentComments(prisma, userId, doc) : false;
      const c = result.comment;
      return reply.send({
        id: c.id,
        documentId: c.documentId,
        authorId: c.authorId,
        authorName: c.authorName,
        text: c.text,
        parentId: c.parentId,
        anchorHeadingId: c.anchorHeadingId,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        deletedAt: c.deletedAt?.toISOString() ?? null,
        canDelete: c.authorId === userId || canModerate,
      });
    }
  );

  /** DELETE Document comment – author or moderator (canRead + moderation rule). */
  app.delete<{ Params: { documentId: string; commentId: string } }>(
    '/documents/:documentId/comments/:commentId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId, commentId } = documentCommentIdParamSchema.parse(request.params);
      const doc = await loadDocument(prisma, documentId);
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      const canModerate = await canModerateDocumentComments(prisma, userId, doc);
      const result = await deleteDocumentComment(prisma, {
        documentId,
        commentId,
        userId,
        canModerate,
      });
      if (!result.ok) {
        if (result.error === 'not_found')
          return reply.status(404).send({ error: 'Comment not found' });
        if (result.error === 'already_deleted') {
          return reply.status(409).send({ error: 'Comment already removed' });
        }
        return reply.status(403).send({ error: 'You cannot delete this comment' });
      }
      return reply.status(204).send();
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
    const initialBlocks = emptyBlockDocumentJson();

    if (body.contextId == null) {
      const doc = await prisma.document.create({
        data: {
          title: body.title,
          draftBlocks: initialBlocks,
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
          draftBlocks: true,
          publishedAt: true,
          pdfUrl: true,
          contextId: true,
          createdAt: true,
          updatedAt: true,
          description: true,
          createdById: true,
          createdBy: { select: { name: true } },
          documentTags: { include: { tag: { select: { id: true, name: true } } } },
          currentPublishedVersion: { select: { blocks: true } },
        },
      });
      try {
        await enqueueIncrementalReindexForDocument({
          documentId: doc.id,
          contextId: null,
          trigger: 'document-created',
        });
      } catch (error) {
        request.log.warn(
          { error, documentId: doc.id },
          'Failed to enqueue reindex job after document creation'
        );
      }
      return reply.status(201).send({
        ...created,
        content: documentMarkdownFromRow({
          publishedAt: created.publishedAt,
          draftBlocks: created.draftBlocks,
          currentPublishedVersion: created.currentPublishedVersion,
        }),
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
        draftBlocks: initialBlocks,
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
        draftBlocks: true,
        publishedAt: true,
        pdfUrl: true,
        contextId: true,
        createdAt: true,
        updatedAt: true,
        description: true,
        createdById: true,
        createdBy: { select: { name: true } },
        documentTags: { include: { tag: { select: { id: true, name: true } } } },
        currentPublishedVersion: { select: { blocks: true } },
      },
    });
    try {
      await enqueueIncrementalReindexForDocument({
        documentId: doc.id,
        contextId: created.contextId,
        trigger: 'document-created',
      });
    } catch (error) {
      request.log.warn(
        { error, documentId: doc.id },
        'Failed to enqueue reindex job after document creation'
      );
    }
    return reply.status(201).send({
      ...created,
      content: documentMarkdownFromRow({
        publishedAt: created.publishedAt,
        draftBlocks: created.draftBlocks,
        currentPublishedVersion: created.currentPublishedVersion,
      }),
      createdByName: created.createdBy?.name ?? null,
      writers: { users: [], teams: [], departments: [] },
    });
  });

  /** PATCH Dokument – nur Metadaten (title, contextId, description, tagIds). Lifecycle über dedizierte Endpoints. */
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

      const beforeUpdate = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          publishedAt: true,
          title: true,
          description: true,
          contextId: true,
          documentTags: { select: { tagId: true } },
        },
      });
      if (!beforeUpdate) return reply.status(404).send({ error: 'Document not found' });

      const shouldConsiderReaderNotification =
        beforeUpdate.publishedAt != null && patchTouchesReaderVisibleFields(body);

      try {
        const doc: DocumentMetadataUpdateResult = await updateDocumentMetadata(prisma, documentId, {
          title: body.title,
          contextId: body.contextId,
          description: body.description,
          tagIds: body.tagIds,
        });
        try {
          await enqueueIncrementalReindexForDocument({
            documentId,
            contextId: doc.contextId,
            trigger: 'document-updated',
          });
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue reindex job after document update'
          );
        }
        try {
          if (
            shouldConsiderReaderNotification &&
            readerVisibleContentChanged({ before: beforeUpdate, body, after: doc })
          ) {
            const readerIds = excludeUserIds(
              await listUserIdsWhoCanReadDocument(prisma, documentId),
              userId
            );
            await enqueueNotificationEvent({
              eventType: 'document-updated',
              targetUserIds: readerIds,
              payload: { documentId, contextId: doc.contextId, updatedByUserId: userId },
            });
          }
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue notification job after document update'
          );
        }
        const mdRow = await prisma.document.findUnique({
          where: { id: documentId },
          select: {
            publishedAt: true,
            draftBlocks: true,
            currentPublishedVersion: { select: { blocks: true } },
          },
        });
        return reply.send({
          ...doc,
          content: mdRow
            ? documentMarkdownFromRow({
                publishedAt: mdRow.publishedAt,
                draftBlocks: mdRow.draftBlocks,
                currentPublishedVersion: mdRow.currentPublishedVersion,
              })
            : '',
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
      let notifyTargets: string[] = [];
      try {
        notifyTargets = excludeUserIds(
          await listUserIdsWhoCanReadOrWriteDocument(prisma, documentId),
          userId
        );
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to resolve notification recipients before document delete'
        );
      }
      await deleteDocument(prisma, documentId);
      try {
        await enqueueIncrementalReindexForDocument({
          documentId,
          trigger: 'document-deleted',
        });
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to enqueue reindex job after document delete'
        );
      }
      try {
        await enqueueNotificationEvent({
          eventType: 'document-deleted',
          targetUserIds: notifyTargets,
          payload: { documentId, deletedByUserId: userId },
        });
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to enqueue notification job after document delete'
        );
      }
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
        try {
          await enqueueIncrementalReindexForDocument({
            documentId,
            trigger: 'document-updated',
          });
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue reindex job after document restore'
          );
        }
        try {
          const readerIds = excludeUserIds(
            await listUserIdsWhoCanReadDocument(prisma, documentId),
            userId
          );
          await enqueueNotificationEvent({
            eventType: 'document-restored',
            targetUserIds: readerIds,
            payload: { documentId, restoredByUserId: userId },
          });
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue notification job after document restore'
          );
        }
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

  /** GET Kandidaten für nutzerbasiertes Write-Granting (Scope-User ohne implizite Writer). */
  app.get(
    '/documents/:documentId/grants/candidate-users',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          contextId: true,
          context: {
            select: {
              process: {
                select: {
                  owner: {
                    select: {
                      ownerUserId: true,
                      companyId: true,
                      departmentId: true,
                      teamId: true,
                      team: {
                        select: { departmentId: true, department: { select: { companyId: true } } },
                      },
                    },
                  },
                },
              },
              project: {
                select: {
                  owner: {
                    select: {
                      ownerUserId: true,
                      companyId: true,
                      departmentId: true,
                      teamId: true,
                      team: {
                        select: { departmentId: true, department: { select: { companyId: true } } },
                      },
                    },
                  },
                },
              },
              subcontext: {
                select: {
                  project: {
                    select: {
                      owner: {
                        select: {
                          ownerUserId: true,
                          companyId: true,
                          departmentId: true,
                          teamId: true,
                          team: {
                            select: {
                              departmentId: true,
                              department: { select: { companyId: true } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      const owner =
        doc.context?.process?.owner ??
        doc.context?.project?.owner ??
        doc.context?.subcontext?.project?.owner ??
        null;

      const ownerUserId = owner?.ownerUserId ?? null;
      const ownerCompanyId = owner?.companyId ?? owner?.team?.department?.companyId ?? null;
      const ownerDepartmentId = owner?.departmentId ?? owner?.team?.departmentId ?? null;
      const ownerTeamId = owner?.teamId ?? null;

      const scopeUserIds = new Set<string>();
      if (ownerUserId != null) scopeUserIds.add(ownerUserId);
      if (ownerCompanyId != null) {
        const [members, teamLeads, departmentLeads, companyLeads] = await Promise.all([
          prisma.teamMember.findMany({
            where: { team: { department: { companyId: ownerCompanyId } } },
            select: { userId: true },
          }),
          prisma.teamLead.findMany({
            where: { team: { department: { companyId: ownerCompanyId } } },
            select: { userId: true },
          }),
          prisma.departmentLead.findMany({
            where: { department: { companyId: ownerCompanyId } },
            select: { userId: true },
          }),
          prisma.companyLead.findMany({
            where: { companyId: ownerCompanyId },
            select: { userId: true },
          }),
        ]);
        for (const row of members) scopeUserIds.add(row.userId);
        for (const row of teamLeads) scopeUserIds.add(row.userId);
        for (const row of departmentLeads) scopeUserIds.add(row.userId);
        for (const row of companyLeads) scopeUserIds.add(row.userId);
      } else if (ownerDepartmentId != null) {
        const [members, teamLeads, departmentLeads] = await Promise.all([
          prisma.teamMember.findMany({
            where: { team: { departmentId: ownerDepartmentId } },
            select: { userId: true },
          }),
          prisma.teamLead.findMany({
            where: { team: { departmentId: ownerDepartmentId } },
            select: { userId: true },
          }),
          prisma.departmentLead.findMany({
            where: { departmentId: ownerDepartmentId },
            select: { userId: true },
          }),
        ]);
        for (const row of members) scopeUserIds.add(row.userId);
        for (const row of teamLeads) scopeUserIds.add(row.userId);
        for (const row of departmentLeads) scopeUserIds.add(row.userId);
      } else if (ownerTeamId != null) {
        const [members, teamLeads] = await Promise.all([
          prisma.teamMember.findMany({
            where: { teamId: ownerTeamId },
            select: { userId: true },
          }),
          prisma.teamLead.findMany({
            where: { teamId: ownerTeamId },
            select: { userId: true },
          }),
        ]);
        for (const row of members) scopeUserIds.add(row.userId);
        for (const row of teamLeads) scopeUserIds.add(row.userId);
      }

      const implicitWriterIds =
        doc.contextId != null
          ? await listUserIdsWhoCanWriteContext(prisma, doc.contextId)
          : (
              await prisma.user.findMany({
                where: { isAdmin: true, deletedAt: null },
                select: { id: true },
              })
            ).map((u) => u.id);
      const implicitWriterSet = new Set(implicitWriterIds);
      const candidateIds = [...scopeUserIds].filter((id) => !implicitWriterSet.has(id));
      if (candidateIds.length === 0) return reply.send({ items: [] });

      const users = await prisma.user.findMany({
        where: { id: { in: candidateIds }, deletedAt: null },
        select: { id: true, name: true, email: true },
        orderBy: [{ name: 'asc' }, { email: 'asc' }],
      });
      return reply.send({
        items: users.map((u) => ({ id: u.id, name: u.name ?? u.email ?? u.id, email: u.email })),
      });
    }
  );

  /** PUT User-Grants ersetzen – requireDocumentAccess('write'). */
  app.put(
    '/documents/:documentId/grants/users',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const actorUserId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const { grants } = putGrantsUsersBodySchema.parse(request.body);
      const beforeUnion = new Set([
        ...(await listUserIdsWhoCanReadDocument(prisma, documentId)),
        ...(await listUserIdsWhoCanWriteDocument(prisma, documentId)),
      ]);
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
      try {
        await enqueueDocumentGrantsChangedNotifications({
          prisma,
          documentId,
          actorUserId,
          beforeUnion,
        });
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to enqueue notification job after user grants update'
        );
      }
      return reply.send({ grants: list });
    }
  );

  /** PUT Team-Grants ersetzen – requireDocumentAccess('write'). */
  app.put(
    '/documents/:documentId/grants/teams',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const actorUserId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const { grants } = putGrantsTeamsBodySchema.parse(request.body);
      if (grants.some((g) => g.role === 'Write')) {
        return reply.status(400).send({
          error: 'Team write grants are not supported. Assign write access to individual users.',
        });
      }
      const beforeUnion = new Set([
        ...(await listUserIdsWhoCanReadDocument(prisma, documentId)),
        ...(await listUserIdsWhoCanWriteDocument(prisma, documentId)),
      ]);
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
      try {
        await enqueueDocumentGrantsChangedNotifications({
          prisma,
          documentId,
          actorUserId,
          beforeUnion,
        });
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to enqueue notification job after team grants update'
        );
      }
      return reply.send({ grants: list });
    }
  );

  /** PUT Department-Grants ersetzen – requireDocumentAccess('write'). */
  app.put(
    '/documents/:documentId/grants/departments',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const actorUserId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const { grants } = putGrantsDepartmentsBodySchema.parse(request.body);
      if (grants.some((g) => g.role === 'Write')) {
        return reply.status(400).send({
          error:
            'Department write grants are not supported. Assign write access to individual users.',
        });
      }
      const beforeUnion = new Set([
        ...(await listUserIdsWhoCanReadDocument(prisma, documentId)),
        ...(await listUserIdsWhoCanWriteDocument(prisma, documentId)),
      ]);
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
      try {
        await enqueueDocumentGrantsChangedNotifications({
          prisma,
          documentId,
          actorUserId,
          beforeUnion,
        });
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to enqueue notification job after department grants update'
        );
      }
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
