import type { FastifyInstance } from 'fastify';
import {
  requireAuthPreHandler,
  preHandlerWrap,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../auth/middleware.js';
import { requireDocumentAccess, canReadSuggestions } from '../permissions/index.js';
import {
  acceptDocumentSuggestion,
  createDocumentSuggestion,
  listDocumentSuggestions,
  rejectDocumentSuggestion,
  StaleSuggestionError,
  SuggestionForbiddenError,
  SuggestionOpsValidationError,
  SuggestionParentDocumentNotFoundError,
  withdrawDocumentSuggestion,
} from '../services/collaboration/documentSuggestionService.js';
import { serializeDocumentSuggestion } from '../services/route-support/documentSuggestionRouteSupport.js';
import {
  createDocumentSuggestionBodySchema,
  listDocumentSuggestionsQuerySchema,
} from '../schemas/documents.js';
import {
  collaborationSuggestionPrismaUserAndIds,
  ensureSuggestionCreateAllowed,
  handleSuggestionNotFoundOrInvalidState,
  parseDocumentId,
  resolveSuggestionBodyIfLeadAllowed,
  sendAcceptSuggestionResolveErrors,
} from './collaboration-route-helpers.js';

export function registerCollaborationSuggestionRoutes(app: FastifyInstance): void {
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
      const { prisma, userId, documentId, suggestionId } =
        collaborationSuggestionPrismaUserAndIds(request);
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
      const { prisma, userId, documentId, suggestionId } =
        collaborationSuggestionPrismaUserAndIds(request);
      const body = await resolveSuggestionBodyIfLeadAllowed(
        prisma,
        userId,
        documentId,
        reply,
        'Nur der Scope-Lead kann Suggestions annehmen.',
        request.body
      );
      if (body == null) return;

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
        if (sendAcceptSuggestionResolveErrors(err, reply)) return;
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
      const { prisma, userId, documentId, suggestionId } =
        collaborationSuggestionPrismaUserAndIds(request);
      const body = await resolveSuggestionBodyIfLeadAllowed(
        prisma,
        userId,
        documentId,
        reply,
        'Nur der Scope-Lead kann Suggestions ablehnen.',
        request.body
      );
      if (body == null) return;

      try {
        const row = await rejectDocumentSuggestion(prisma, documentId, suggestionId, userId, body);
        return reply.send(serializeDocumentSuggestion(row));
      } catch (err) {
        if (handleSuggestionNotFoundOrInvalidState(err, reply)) return;
        throw err;
      }
    }
  );
}
