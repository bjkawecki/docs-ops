import { z } from 'zod';
import type { Prisma, PrismaClient } from '../../../../../generated/prisma/client.js';
import { DocumentSuggestionStatus } from '../../../../../generated/prisma/client.js';
import { parseBlockDocumentFromDb } from '../blocks/documentBlocksBackfill.js';
import { safeParseBlockDocumentV0 } from '../blocks/blockSchema.js';
import {
  applySuggestionOpsToDocument,
  suggestionOpsArraySchema,
  type SuggestionOp,
} from './documentSuggestionOps.js';

function parseSuggestionOpsStrict(input: unknown): SuggestionOp[] {
  try {
    return suggestionOpsArraySchema.parse(input);
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new SuggestionOpsValidationError('Ungültige Ops', e.flatten());
    }
    throw e;
  }
}

export class SuggestionNotFoundError extends Error {
  constructor() {
    super('Suggestion not found');
    this.name = 'SuggestionNotFoundError';
  }
}

export class SuggestionParentDocumentNotFoundError extends Error {
  constructor() {
    super('Document not found');
    this.name = 'SuggestionParentDocumentNotFoundError';
  }
}

export class SuggestionForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'SuggestionForbiddenError';
  }
}

export class StaleSuggestionError extends Error {
  constructor() {
    super('Suggestion basis veraltet');
    this.name = 'StaleSuggestionError';
  }
}

export class SuggestionInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuggestionInvalidStateError';
  }
}

export class SuggestionOpsValidationError extends Error {
  constructor(
    message: string,
    public readonly issues?: unknown
  ) {
    super(message);
    this.name = 'SuggestionOpsValidationError';
  }
}

export class LeadDraftNotInitializedError extends Error {
  constructor() {
    super('Lead-Draft (Blocks) ist noch nicht initialisiert');
    this.name = 'LeadDraftNotInitializedError';
  }
}

export type ListDocumentSuggestionsFilter = {
  status?: DocumentSuggestionStatus;
};

export async function listDocumentSuggestions(
  prisma: PrismaClient,
  documentId: string,
  filter: ListDocumentSuggestionsFilter
) {
  return prisma.documentSuggestion.findMany({
    where: {
      documentId,
      ...(filter.status != null ? { status: filter.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });
}

export type CreateDocumentSuggestionInput = {
  baseDraftRevision: number;
  ops: unknown;
  publishedVersionId?: string | null;
};

export async function createDocumentSuggestion(
  prisma: PrismaClient,
  documentId: string,
  authorId: string,
  input: CreateDocumentSuggestionInput
) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { id: true, draftRevision: true },
  });
  if (!doc) throw new SuggestionParentDocumentNotFoundError();

  if (doc.draftRevision !== input.baseDraftRevision) {
    throw new StaleSuggestionError();
  }

  if (input.publishedVersionId) {
    const v = await prisma.documentVersion.findFirst({
      where: { id: input.publishedVersionId, documentId },
      select: { id: true },
    });
    if (!v)
      throw new SuggestionOpsValidationError('publishedVersionId gehört nicht zu diesem Dokument');
  }

  const parsedOps = parseSuggestionOpsStrict(input.ops);

  const row = await prisma.documentSuggestion.create({
    data: {
      documentId,
      authorId,
      status: DocumentSuggestionStatus.pending,
      baseDraftRevision: input.baseDraftRevision,
      publishedVersionId: input.publishedVersionId ?? null,
      ops: parsedOps as unknown as Prisma.InputJsonValue,
    },
    include: {
      author: { select: { id: true, name: true } },
    },
  });
  return row;
}

export async function withdrawDocumentSuggestion(
  prisma: PrismaClient,
  documentId: string,
  suggestionId: string,
  userId: string
) {
  const row = await prisma.documentSuggestion.findFirst({
    where: { id: suggestionId, documentId },
    select: { id: true, authorId: true, status: true },
  });
  if (!row) throw new SuggestionNotFoundError();
  if (row.authorId !== userId)
    throw new SuggestionForbiddenError('Nur der Autor kann zurückziehen');
  if (row.status !== DocumentSuggestionStatus.pending) {
    throw new SuggestionInvalidStateError('Nur pending-Vorschläge können zurückgezogen werden');
  }

  return prisma.documentSuggestion.update({
    where: { id: row.id },
    data: { status: DocumentSuggestionStatus.withdrawn },
    include: {
      author: { select: { id: true, name: true } },
    },
  });
}

export type ResolveSuggestionCommentInput = {
  comment?: string | null;
};

const suggestionResolvedRowInclude = {
  author: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
} as const;

function buildSuggestionResolveUpdateData(
  resolverUserId: string,
  input: ResolveSuggestionCommentInput,
  status: typeof DocumentSuggestionStatus.accepted | typeof DocumentSuggestionStatus.rejected
) {
  return {
    status,
    resolvedAt: new Date(),
    resolvedById: resolverUserId,
    comment: input.comment?.trim() ? input.comment.trim() : null,
  };
}

export async function rejectDocumentSuggestion(
  prisma: PrismaClient,
  documentId: string,
  suggestionId: string,
  resolverUserId: string,
  input: ResolveSuggestionCommentInput
) {
  const row = await prisma.documentSuggestion.findFirst({
    where: { id: suggestionId, documentId },
    select: { id: true, status: true },
  });
  if (!row) throw new SuggestionNotFoundError();
  if (row.status !== DocumentSuggestionStatus.pending) {
    throw new SuggestionInvalidStateError('Nur pending-Vorschläge können abgelehnt werden');
  }

  return prisma.documentSuggestion.update({
    where: { id: row.id },
    data: buildSuggestionResolveUpdateData(
      resolverUserId,
      input,
      DocumentSuggestionStatus.rejected
    ),
    include: suggestionResolvedRowInclude,
  });
}

export async function acceptDocumentSuggestion(
  prisma: PrismaClient,
  documentId: string,
  suggestionId: string,
  resolverUserId: string,
  input: ResolveSuggestionCommentInput
) {
  return prisma.$transaction(async (tx) => {
    const suggestion = await tx.documentSuggestion.findFirst({
      where: { id: suggestionId, documentId },
    });
    if (!suggestion) throw new SuggestionNotFoundError();
    if (suggestion.status !== DocumentSuggestionStatus.pending) {
      throw new SuggestionInvalidStateError('Nur pending-Vorschläge können angenommen werden');
    }

    const doc = await tx.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: { draftRevision: true, draftBlocks: true },
    });
    if (!doc) throw new SuggestionParentDocumentNotFoundError();

    if (doc.draftRevision !== suggestion.baseDraftRevision) {
      throw new StaleSuggestionError();
    }

    const ops = parseSuggestionOpsStrict(suggestion.ops);

    const draftParsed = parseBlockDocumentFromDb(doc.draftBlocks);
    if (!draftParsed) {
      throw new LeadDraftNotInitializedError();
    }

    const applied = applySuggestionOpsToDocument(draftParsed, ops);
    if (!applied.ok) {
      throw new SuggestionOpsValidationError(applied.error);
    }

    const validated = safeParseBlockDocumentV0(applied.document);
    if (!validated.success) {
      throw new SuggestionOpsValidationError('Ergebnis-Blocks ungültig', validated.error.flatten());
    }

    const json = validated.data as unknown as Prisma.InputJsonValue;

    const updated = await tx.document.updateMany({
      where: {
        id: documentId,
        deletedAt: null,
        draftRevision: suggestion.baseDraftRevision,
      },
      data: {
        draftBlocks: json,
        draftRevision: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new StaleSuggestionError();
    }

    const saved = await tx.documentSuggestion.update({
      where: { id: suggestionId },
      data: buildSuggestionResolveUpdateData(
        resolverUserId,
        input,
        DocumentSuggestionStatus.accepted
      ),
      include: suggestionResolvedRowInclude,
    });

    return { suggestion: saved, draftRevision: doc.draftRevision + 1, blocks: validated.data };
  });
}
