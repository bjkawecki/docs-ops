import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { requireAuthPreHandler, preHandlerWrap } from '../../auth/middleware.js';
import {
  requireDocumentAccess,
  canModerateDocumentComments,
  canReadLeadDraft,
  canEditLeadDraft,
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
  patchLeadDraftBodySchema,
  paginationQuerySchema,
  createDocumentCommentBodySchema,
  patchDocumentCommentBodySchema,
} from '../schemas/documents.js';
import {
  excludeUserIds,
  listUserIdsWhoCanReadDocument,
} from '../../notifications/services/notificationRecipients.js';
import { enqueueNotificationEvent } from '../services/route-support/documentRouteSupport.js';
import {
  routePrismaUserDocumentCommentIds,
  routePrismaUserDocumentId,
} from './collaboration-route-helpers.js';
import { registerCollaborationSuggestionRoutes } from './collaboration-suggestions.routes.js';

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
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);

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

  registerCollaborationSuggestionRoutes(app);

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
