import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  requireAuthPreHandler,
  preHandlerWrap,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../auth/middleware.js';
import {
  requireDocumentAccess,
  canModerateDocumentComments,
  canReadLeadDraft,
  canEditLeadDraft,
  canCreateSuggestion,
  canReadSuggestions,
  canResolveSuggestion,
} from '../permissions/index.js';
import { loadDocument } from '../permissions/canRead.js';
import { getLeadDraftForUser, patchLeadDraft } from '../services/lifecycle/leadDraftService.js';
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
} from '../services/collaboration/documentSuggestionService.js';
import {
  createDocumentComment,
  deleteDocumentComment,
  listDocumentComments,
  updateDocumentComment,
} from '../services/collaboration/documentCommentService.js';
import {
  loadDocumentCommentAnchorSnapshot,
  mapCreateCommentError,
  mapDeleteCommentError,
  mapUpdateCommentError,
  serializeCommentRow,
  serializeCommentTree,
} from '../services/route-support/documentCommentRouteSupport.js';
import { serializeDocumentSuggestion } from '../services/route-support/documentSuggestionRouteSupport.js';
import {
  documentIdParamSchema,
  patchLeadDraftBodySchema,
  listDocumentSuggestionsQuerySchema,
  createDocumentSuggestionBodySchema,
  resolveDocumentSuggestionBodySchema,
  suggestionIdParamSchema,
  paginationQuerySchema,
  documentCommentIdParamSchema,
  createDocumentCommentBodySchema,
  patchDocumentCommentBodySchema,
} from '../schemas/documents.js';
import {
  excludeUserIds,
  listUserIdsWhoCanReadDocument,
} from '../../notifications/services/notificationRecipients.js';
import { enqueueNotificationEvent } from '../services/route-support/documentRouteSupport.js';

function parseSuggestionParams(params: unknown): { documentId: string; suggestionId: string } {
  return suggestionIdParamSchema.parse(params);
}

function parseDocumentId(params: unknown): string {
  return documentIdParamSchema.parse(params).documentId;
}

async function ensureSuggestionCreateAllowed(
  prisma: FastifyInstance['prisma'],
  userId: string,
  documentId: string,
  reply: FastifyReply,
  message: string
): Promise<boolean> {
  const allowed = await canCreateSuggestion(prisma, userId, documentId);
  if (!allowed) {
    await reply.status(403).send({ error: message });
    return false;
  }
  return true;
}

async function ensureSuggestionResolveAllowed(
  prisma: FastifyInstance['prisma'],
  userId: string,
  documentId: string,
  reply: FastifyReply,
  message: string
): Promise<boolean> {
  const allowed = await canResolveSuggestion(prisma, userId, documentId);
  if (!allowed) {
    await reply.status(403).send({ error: message });
    return false;
  }
  return true;
}

function handleSuggestionNotFoundOrInvalidState(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof SuggestionNotFoundError) {
    reply.status(404).send({ error: 'Suggestion not found' });
    return true;
  }
  if (err instanceof SuggestionInvalidStateError) {
    reply.status(400).send({ error: err.message });
    return true;
  }
  return false;
}

export const registerCollaborationRoutes = (app: FastifyInstance): void => {
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
      const documentId = parseDocumentId(request.params);

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
      const documentId = parseDocumentId(request.params);

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

  /** GET Suggestions (EPIC-5): nur Writer/Lead wie Lead-Draft-Lesen. */
  app.get<{ Params: { documentId: string }; Querystring: Record<string, string | undefined> }>(
    '/documents/:documentId/suggestions',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const documentId = parseDocumentId(request.params);
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
      const documentId = parseDocumentId(request.params);
      if (
        !(await ensureSuggestionCreateAllowed(
          prisma,
          userId,
          documentId,
          reply,
          'Nur Schreibende können Suggestions anlegen.'
        ))
      ) {
        return;
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
      const { documentId, suggestionId } = parseSuggestionParams(request.params);
      if (!(await ensureSuggestionCreateAllowed(prisma, userId, documentId, reply, 'Forbidden'))) {
        return;
      }

      try {
        const row = await withdrawDocumentSuggestion(prisma, documentId, suggestionId, userId);
        return reply.send(serializeDocumentSuggestion(row));
      } catch (err) {
        if (handleSuggestionNotFoundOrInvalidState(err, reply)) return;
        if (err instanceof SuggestionForbiddenError) {
          return reply.status(403).send({ error: err.message });
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
      const { documentId, suggestionId } = parseSuggestionParams(request.params);
      if (
        !(await ensureSuggestionResolveAllowed(
          prisma,
          userId,
          documentId,
          reply,
          'Nur der Scope-Lead kann Suggestions annehmen.'
        ))
      ) {
        return;
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
        if (handleSuggestionNotFoundOrInvalidState(err, reply)) return;
        if (err instanceof StaleSuggestionError) {
          return reply.status(409).send({
            error: 'Suggestion oder Lead-Draft wurde zwischenzeitlich geändert.',
            code: 'stale_suggestion',
          });
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
      const { documentId, suggestionId } = parseSuggestionParams(request.params);
      if (
        !(await ensureSuggestionResolveAllowed(
          prisma,
          userId,
          documentId,
          reply,
          'Nur der Scope-Lead kann Suggestions ablehnen.'
        ))
      ) {
        return;
      }

      const body = resolveDocumentSuggestionBodySchema.parse(request.body ?? {});
      try {
        const row = await rejectDocumentSuggestion(prisma, documentId, suggestionId, userId, body);
        return reply.send(serializeDocumentSuggestion(row));
      } catch (err) {
        if (handleSuggestionNotFoundOrInvalidState(err, reply)) return;
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
      const documentId = parseDocumentId(request.params);
      const query = paginationQuerySchema.parse(request.query ?? {});
      const doc = await loadDocument(prisma, documentId);
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      const canModerate = await canModerateDocumentComments(prisma, userId, doc);
      const { items, total } = await listDocumentComments(prisma, documentId, {
        limit: query.limit,
        offset: query.offset,
      });
      return reply.send({
        items: serializeCommentTree(items, { userId, canModerate }),
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
      const documentId = parseDocumentId(request.params);
      const parsed = createDocumentCommentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid body',
          details: parsed.error.flatten(),
        });
      }
      const docSnapshot = await loadDocumentCommentAnchorSnapshot(prisma, documentId);
      if (!docSnapshot) return reply.status(404).send({ error: 'Document not found' });
      const created = await createDocumentComment(prisma, {
        documentId,
        authorId: userId,
        text: parsed.data.text,
        parentId: parsed.data.parentId,
        anchorHeadingId: parsed.data.anchorHeadingId,
        documentBlocks: docSnapshot.activeBlocks,
      });
      if (!created.ok) {
        const mapped = mapCreateCommentError(created);
        return reply.status(mapped.status).send({ error: mapped.error });
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
            documentTitle: docSnapshot.title,
            commentPreview: row.text.slice(0, 200),
          },
        });
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to enqueue notification job after document comment'
        );
      }
      const serialized = serializeCommentRow(row, { userId, canModerate: true });
      return reply
        .status(201)
        .send({ ...serialized, replies: row.parentId == null ? [] : undefined });
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
      const docSnapshot = await loadDocumentCommentAnchorSnapshot(prisma, documentId);
      if (!docSnapshot) return reply.status(404).send({ error: 'Document not found' });
      const result = await updateDocumentComment(prisma, {
        documentId,
        commentId,
        userId,
        text: body.text,
        anchorHeadingId: body.anchorHeadingId,
        documentBlocks: docSnapshot.activeBlocks,
      });
      if (!result.ok) {
        const mapped = mapUpdateCommentError(result);
        return reply.status(mapped.status).send({ error: mapped.error });
      }
      const doc = await loadDocument(prisma, documentId);
      const canModerate = doc ? await canModerateDocumentComments(prisma, userId, doc) : false;
      const c = result.comment;
      return reply.send(serializeCommentRow(c, { userId, canModerate }));
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
        const mapped = mapDeleteCommentError(result);
        return reply.status(mapped.status).send({ error: mapped.error });
      }
      return reply.status(204).send();
    }
  );
};
