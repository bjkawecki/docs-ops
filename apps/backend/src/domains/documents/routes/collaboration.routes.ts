import type { FastifyInstance } from 'fastify';

/* eslint-disable max-lines -- draft collaboration routes bundle lead-draft, suggestions, presence */
import { treeifyError } from 'zod';
import type { PrismaClient } from '../../../../generated/prisma/client.js';
import {
  requireAuthPreHandler,
  preHandlerWrap,
  type RequestWithUser,
} from '../../auth/middleware.js';
import {
  requireDocumentAccess,
  canModerateDocumentComments,
  canReadLeadDraft,
  canEditLeadDraft,
  canPublishDocument,
  canResolveDraftSuggestion,
} from '../permissions/index.js';
import { loadDocument } from '../permissions/canRead.js';
import type { DocumentForPermission } from '../permissions/documentLoad.js';
import { getLeadDraftForUser, patchLeadDraft } from '../services/lifecycle/leadDraftService.js';
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
import {
  acceptDraftSuggestion,
  declineDraftSuggestion,
  patchDraftSuggestionText,
  withdrawDraftSuggestion,
} from '../services/collaboration/draftSuggestionService.js';
import {
  patchLeadDraftBodySchema,
  draftSuggestionRevisionBodySchema,
  patchDraftSuggestionBodySchema,
  paginationQuerySchema,
  createDocumentCommentBodySchema,
  patchDocumentCommentBodySchema,
} from '../schemas/documents.js';
import {
  listCommentNotificationRecipientIds,
  listDocumentCommentMentionCandidates,
  validateCommentMentionsForDocument,
} from '../../notifications/services/commentNotificationRecipients.js';
import { enqueueNotificationEvent } from '../../notifications/services/notificationEnqueueService.js';
import {
  routePrismaUserDocumentCommentIds,
  routePrismaUserDocumentId,
} from './collaboration-route-helpers.js';
import {
  notifyDraftPresenceChanged,
  notifyLeadDraftCollaborationChanged,
} from '../services/collaboration/documentCollaborationLiveNotify.js';
import {
  listDraftEditorPresence,
  registerDraftEditorPresence,
  unregisterDraftEditorPresence,
} from '../services/collaboration/draftPresenceRegistry.js';

async function loadDocumentWithCommentModeration(
  prisma: PrismaClient,
  userId: string,
  documentId: string
): Promise<{ doc: DocumentForPermission; canModerate: boolean } | null> {
  const doc = await loadDocument(prisma, documentId);
  if (!doc) return null;
  const canModerate = await canModerateDocumentComments(prisma, userId, doc);
  return { doc, canModerate };
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
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);

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
        pendingSuggestionCount: result.view.pendingSuggestionCount,
      });
    }
  );

  /** PATCH Lead-Draft – scope lead, scope author, or personal owner; optimistic lock via expectedRevision. */
  app.patch<{ Params: { documentId: string } }>(
    '/documents/:documentId/lead-draft',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);

      const canEdit = await canEditLeadDraft(prisma, userId, documentId);
      if (!canEdit) {
        return reply.status(403).send({ error: 'You cannot edit this draft.' });
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

      const isPublishLead = await canPublishDocument(prisma, userId, documentId);
      const patchResult = await patchLeadDraft(
        prisma,
        documentId,
        {
          blocks: body.blocks,
          expectedRevision: body.expectedRevision,
        },
        { userId, isPublishLead }
      );

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
        if (patchResult.error === 'author_patch_invalid') {
          return reply.status(400).send({
            error: 'Author may only change suggestion-marked content.',
            code: 'AUTHOR_DRAFT_PATCH_INVALID',
          });
        }
        if (patchResult.error === 'suggestion_delete_overlap') {
          return reply.status(409).send({
            error: 'Overlapping pending delete suggestions are not allowed.',
            code: 'SUGGESTION_DELETE_OVERLAP',
          });
        }
        return reply.status(409).send({
          error: 'Lead-Draft wurde zwischenzeitlich geändert.',
          code: 'DRAFT_REVISION_CONFLICT',
        });
      }

      reply.header('ETag', `"${patchResult.draftRevision}"`);
      if (patchResult.hadContentChange) {
        notifyLeadDraftCollaborationChanged(prisma, documentId, userId, {
          draftRevision: patchResult.draftRevision,
          pendingSuggestionCount: patchResult.pendingSuggestionCount,
        });
      }
      return reply.send({
        draftRevision: patchResult.draftRevision,
        blocks: patchResult.blocks,
        canEdit: true,
        pendingSuggestionCount: patchResult.pendingSuggestionCount,
      });
    }
  );

  app.post<{ Params: { documentId: string; suggestionId: string } }>(
    '/documents/:documentId/draft/suggestions/:suggestionId/accept',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);
      const { suggestionId } = request.params;
      const body = draftSuggestionRevisionBodySchema.parse(request.body);
      const isLead = await canResolveDraftSuggestion(prisma, userId, documentId);
      if (!isLead) {
        return reply.status(403).send({ error: 'Only the scope lead can accept suggestions.' });
      }
      const result = await acceptDraftSuggestion(
        prisma,
        documentId,
        suggestionId,
        body.expectedRevision,
        userId,
        isLead
      );
      if (!result.ok) {
        if (result.error === 'not_found')
          return reply.status(404).send({ error: 'Document not found' });
        if (result.error === 'suggestion_not_found') {
          return reply.status(404).send({ error: 'Suggestion not found' });
        }
        if (result.error === 'conflict') {
          return reply.status(409).send({
            error: 'Lead-Draft was changed concurrently.',
            code: 'DRAFT_REVISION_CONFLICT',
          });
        }
        return reply.status(409).send({ error: result.error });
      }
      reply.header('ETag', `"${result.draftRevision}"`);
      notifyLeadDraftCollaborationChanged(prisma, documentId, userId, {
        draftRevision: result.draftRevision,
        pendingSuggestionCount: result.pendingSuggestionCount,
      });
      return reply.send({
        draftRevision: result.draftRevision,
        blocks: result.blocks,
        pendingSuggestionCount: result.pendingSuggestionCount,
      });
    }
  );

  app.post<{ Params: { documentId: string; suggestionId: string } }>(
    '/documents/:documentId/draft/suggestions/:suggestionId/decline',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);
      const { suggestionId } = request.params;
      const body = draftSuggestionRevisionBodySchema.parse(request.body);
      const isLead = await canResolveDraftSuggestion(prisma, userId, documentId);
      if (!isLead) {
        return reply.status(403).send({ error: 'Only the scope lead can decline suggestions.' });
      }
      const result = await declineDraftSuggestion(
        prisma,
        documentId,
        suggestionId,
        body.expectedRevision,
        userId,
        isLead
      );
      if (!result.ok) {
        if (result.error === 'not_found')
          return reply.status(404).send({ error: 'Document not found' });
        if (result.error === 'suggestion_not_found') {
          return reply.status(404).send({ error: 'Suggestion not found' });
        }
        if (result.error === 'conflict') {
          return reply.status(409).send({
            error: 'Lead-Draft was changed concurrently.',
            code: 'DRAFT_REVISION_CONFLICT',
          });
        }
        return reply.status(409).send({ error: result.error });
      }
      reply.header('ETag', `"${result.draftRevision}"`);
      notifyLeadDraftCollaborationChanged(prisma, documentId, userId, {
        draftRevision: result.draftRevision,
        pendingSuggestionCount: result.pendingSuggestionCount,
      });
      return reply.send({
        draftRevision: result.draftRevision,
        blocks: result.blocks,
        pendingSuggestionCount: result.pendingSuggestionCount,
      });
    }
  );

  app.patch<{ Params: { documentId: string; suggestionId: string } }>(
    '/documents/:documentId/draft/suggestions/:suggestionId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);
      const { suggestionId } = request.params;
      const body = patchDraftSuggestionBodySchema.parse(request.body);
      const result = await patchDraftSuggestionText(
        prisma,
        documentId,
        suggestionId,
        body.expectedRevision,
        userId,
        body.text
      );
      if (!result.ok) {
        if (result.error === 'not_found')
          return reply.status(404).send({ error: 'Document not found' });
        if (result.error === 'suggestion_not_found') {
          return reply.status(404).send({ error: 'Suggestion not found' });
        }
        if (result.error === 'forbidden') {
          return reply.status(403).send({ error: 'You cannot edit this suggestion.' });
        }
        if (result.error === 'conflict') {
          return reply.status(409).send({
            error: 'Lead-Draft was changed concurrently.',
            code: 'DRAFT_REVISION_CONFLICT',
          });
        }
        return reply.status(409).send({ error: result.error });
      }
      reply.header('ETag', `"${result.draftRevision}"`);
      notifyLeadDraftCollaborationChanged(prisma, documentId, userId, {
        draftRevision: result.draftRevision,
        pendingSuggestionCount: result.pendingSuggestionCount,
      });
      return reply.send({
        draftRevision: result.draftRevision,
        blocks: result.blocks,
        pendingSuggestionCount: result.pendingSuggestionCount,
      });
    }
  );

  app.delete<{ Params: { documentId: string; suggestionId: string } }>(
    '/documents/:documentId/draft/suggestions/:suggestionId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);
      const { suggestionId } = request.params;
      const body = draftSuggestionRevisionBodySchema.parse(request.body);
      const result = await withdrawDraftSuggestion(
        prisma,
        documentId,
        suggestionId,
        body.expectedRevision,
        userId
      );
      if (!result.ok) {
        if (result.error === 'not_found')
          return reply.status(404).send({ error: 'Document not found' });
        if (result.error === 'suggestion_not_found') {
          return reply.status(404).send({ error: 'Suggestion not found' });
        }
        if (result.error === 'forbidden') {
          return reply.status(403).send({ error: 'You cannot withdraw this suggestion.' });
        }
        if (result.error === 'conflict') {
          return reply.status(409).send({
            error: 'Lead-Draft was changed concurrently.',
            code: 'DRAFT_REVISION_CONFLICT',
          });
        }
        return reply.status(409).send({ error: result.error });
      }
      reply.header('ETag', `"${result.draftRevision}"`);
      notifyLeadDraftCollaborationChanged(prisma, documentId, userId, {
        draftRevision: result.draftRevision,
        pendingSuggestionCount: result.pendingSuggestionCount,
      });
      return reply.send({
        draftRevision: result.draftRevision,
        blocks: result.blocks,
        pendingSuggestionCount: result.pendingSuggestionCount,
      });
    }
  );

  /** POST draft presence heartbeat (edit mode). */
  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/draft/presence',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);
      const canReadLead = await canReadLeadDraft(prisma, userId, documentId);
      if (!canReadLead) {
        return reply.status(403).send({ error: 'No access to draft presence.' });
      }
      const user = (request as RequestWithUser).user;
      const name = user.name?.trim() || user.email || 'Unknown';
      registerDraftEditorPresence(documentId, userId, name);
      notifyDraftPresenceChanged(prisma, documentId, userId);
      return reply.status(204).send();
    }
  );

  /** DELETE draft presence (leave edit mode / unmount). */
  app.delete<{ Params: { documentId: string } }>(
    '/documents/:documentId/draft/presence',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);
      const canReadLead = await canReadLeadDraft(prisma, userId, documentId);
      if (!canReadLead) {
        return reply.status(403).send({ error: 'No access to draft presence.' });
      }
      unregisterDraftEditorPresence(documentId, userId);
      notifyDraftPresenceChanged(prisma, documentId, userId);
      return reply.status(204).send();
    }
  );

  /** GET current draft editors (polling fallback). */
  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/draft/presence',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('readOrWrite'))],
    },
    async (request, reply) => {
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);
      const canReadLead = await canReadLeadDraft(prisma, userId, documentId);
      if (!canReadLead) {
        return reply.status(403).send({ error: 'No access to draft presence.' });
      }
      const editors = listDraftEditorPresence(documentId).map((e) => ({
        userId: e.userId,
        name: e.name,
      }));
      return reply.send({ documentId, editors });
    }
  );

  /** GET users who can be @mentioned on this document (canRead). */
  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/comments/mention-candidates',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const { prisma, documentId } = routePrismaUserDocumentId(request);
      const items = await listDocumentCommentMentionCandidates(prisma, documentId);
      return reply.send({ items });
    }
  );

  /** GET Document comments (canRead). Top-level only (parentId null); pagination. */
  app.get<{ Params: { documentId: string }; Querystring: Record<string, string | undefined> }>(
    '/documents/:documentId/comments',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);
      const query = paginationQuerySchema.parse(request.query ?? {});
      const loaded = await loadDocumentWithCommentModeration(prisma, userId, documentId);
      if (!loaded) return reply.status(404).send({ error: 'Document not found' });
      const { canModerate } = loaded;
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
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);
      const parsed = createDocumentCommentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid body',
          details: treeifyError(parsed.error),
        });
      }
      const docSnapshot = await loadDocumentCommentAnchorSnapshot(prisma, documentId);
      if (!docSnapshot) return reply.status(404).send({ error: 'Document not found' });
      const mentionCheck = await validateCommentMentionsForDocument(
        prisma,
        documentId,
        parsed.data.text
      );
      if (!mentionCheck.ok) {
        return reply.status(400).send({
          error: 'One or more mentioned users cannot read this document.',
        });
      }
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
        const { recipientIds, kind } = await listCommentNotificationRecipientIds({
          prisma,
          documentId,
          authorUserId: userId,
          parentId: row.parentId,
          text: row.text,
        });
        if (recipientIds.length > 0) {
          await enqueueNotificationEvent({
            eventType: 'document-comment-created',
            targetUserIds: recipientIds,
            payload: {
              documentId,
              commentId: row.id,
              parentId: row.parentId,
              authorUserId: userId,
              documentTitle: docSnapshot.title,
              commentPreview: row.text.slice(0, 200),
              kind,
            },
          });
        }
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
      const { prisma, userId, documentId, commentId } = routePrismaUserDocumentCommentIds(request);
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
      const { prisma, userId, documentId, commentId } = routePrismaUserDocumentCommentIds(request);
      const loaded = await loadDocumentWithCommentModeration(prisma, userId, documentId);
      if (!loaded) return reply.status(404).send({ error: 'Document not found' });
      const { canModerate } = loaded;
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
