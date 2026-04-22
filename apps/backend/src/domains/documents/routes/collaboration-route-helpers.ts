import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { getEffectiveUserId, type RequestWithUser } from '../../auth/middleware.js';
import { canCreateSuggestion, canResolveSuggestion } from '../permissions/index.js';
import {
  LeadDraftNotInitializedError,
  StaleSuggestionError,
  SuggestionInvalidStateError,
  SuggestionNotFoundError,
  SuggestionOpsValidationError,
} from '../services/collaboration/documentSuggestionService.js';
import {
  documentCommentIdParamSchema,
  documentIdParamSchema,
  resolveDocumentSuggestionBodySchema,
  suggestionIdParamSchema,
} from '../schemas/documents.js';

export function parseSuggestionParams(params: unknown): {
  documentId: string;
  suggestionId: string;
} {
  return suggestionIdParamSchema.parse(params);
}

export function parseDocumentId(params: unknown): string {
  return documentIdParamSchema.parse(params).documentId;
}

/** prisma + userId + documentId für Routen mit `:documentId`. */
export function routePrismaUserDocumentId(request: {
  server: { prisma: PrismaClient };
  params: unknown;
}): { prisma: PrismaClient; userId: string; documentId: string } {
  return {
    prisma: request.server.prisma,
    userId: getEffectiveUserId(request as RequestWithUser),
    documentId: parseDocumentId(request.params),
  };
}

export function routePrismaUserDocumentCommentIds(request: {
  server: { prisma: PrismaClient };
  params: unknown;
}): { prisma: PrismaClient; userId: string; documentId: string; commentId: string } {
  const base = routePrismaUserDocumentId(request);
  const { commentId } = documentCommentIdParamSchema.parse(request.params);
  return { ...base, commentId };
}

export function collaborationSuggestionPrismaUserAndIds(request: {
  server: { prisma: PrismaClient };
  params: unknown;
}): { prisma: PrismaClient; userId: string; documentId: string; suggestionId: string } {
  const prisma = request.server.prisma;
  const userId = getEffectiveUserId(request as RequestWithUser);
  const { documentId, suggestionId } = parseSuggestionParams(request.params);
  return { prisma, userId, documentId, suggestionId };
}

export async function ensureSuggestionCreateAllowed(
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

export async function ensureSuggestionResolveAllowed(
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

/** Lead-Gate + Body-Parse für Accept/Reject (gleiche Fehlerantworten wie zuvor). */
export async function resolveSuggestionBodyIfLeadAllowed(
  prisma: FastifyInstance['prisma'],
  userId: string,
  documentId: string,
  reply: FastifyReply,
  leadDeniedMessage: string,
  rawBody: unknown
): Promise<ReturnType<typeof resolveDocumentSuggestionBodySchema.parse> | null> {
  if (
    !(await ensureSuggestionResolveAllowed(prisma, userId, documentId, reply, leadDeniedMessage))
  ) {
    return null;
  }
  return resolveDocumentSuggestionBodySchema.parse(rawBody ?? {});
}

export function handleSuggestionNotFoundOrInvalidState(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof SuggestionNotFoundError) {
    void reply.status(404).send({ error: 'Suggestion not found' });
    return true;
  }
  if (err instanceof SuggestionInvalidStateError) {
    void reply.status(400).send({ error: err.message });
    return true;
  }
  return false;
}

/** Fehlerbehandlung Accept-Suggestion (409/400; NotFound/InvalidState zuerst). */
export function sendAcceptSuggestionResolveErrors(err: unknown, reply: FastifyReply): boolean {
  if (handleSuggestionNotFoundOrInvalidState(err, reply)) return true;
  if (err instanceof StaleSuggestionError) {
    void reply.status(409).send({
      error: 'Suggestion oder Lead-Draft wurde zwischenzeitlich geändert.',
      code: 'stale_suggestion',
    });
    return true;
  }
  if (err instanceof SuggestionOpsValidationError) {
    void reply.status(400).send({ error: err.message, details: err.issues });
    return true;
  }
  if (err instanceof LeadDraftNotInitializedError) {
    void reply.status(400).send({ error: err.message });
    return true;
  }
  return false;
}
