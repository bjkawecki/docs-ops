import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { DocumentSuggestionStatus } from '../../../../generated/prisma/client.js';
import { getPublishableContextIds } from '../../organisation/permissions/catalogPermissions.js';
import { getScopeFromOwner, ownerScopeSelect } from '../routes/me/route-helpers.js';
import { suggestionOpsArraySchema } from '../../documents/services/collaboration/documentSuggestionOps.js';

const documentSelect = {
  id: true,
  title: true,
  contextId: true,
  context: {
    select: {
      process: { select: { owner: { select: ownerScopeSelect } } },
      project: { select: { owner: { select: ownerScopeSelect } } },
      subcontext: {
        select: { project: { select: { owner: { select: ownerScopeSelect } } } },
      },
    },
  },
} as const;

type SuggestionWithDocument = {
  id: string;
  documentId: string;
  authorId: string;
  status: DocumentSuggestionStatus;
  baseDraftRevision: number;
  ops: unknown;
  createdAt: Date;
  author: { id: string; name: string | null };
  document: {
    id: string;
    title: string;
    contextId: string | null;
    context: {
      process: { owner: Parameters<typeof getScopeFromOwner>[0] } | null;
      project: { owner: Parameters<typeof getScopeFromOwner>[0] } | null;
      subcontext: { project: { owner: Parameters<typeof getScopeFromOwner>[0] } } | null;
    } | null;
  };
};

export type MeReviewsQuery = {
  limit: number;
  offset: number;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'superseded';
};

export type ReviewSuggestionItem = {
  suggestionId: string;
  documentId: string;
  documentTitle: string;
  status: DocumentSuggestionStatus;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  scopeType: 'team' | 'department' | 'company' | 'personal';
  scopeId: string | null;
  scopeName: string;
  baseDraftRevision: number;
  affectedBlockSummary: string | null;
};

export type MeReviewsResult = {
  pendingForReview: ReviewSuggestionItem[];
  mySuggestions: ReviewSuggestionItem[];
  totalPendingForReview: number;
  totalMySuggestions: number;
  limit: number;
  offset: number;
};

function summarizeSuggestionOps(ops: unknown): string | null {
  const parsed = suggestionOpsArraySchema.safeParse(ops);
  if (!parsed.success) return null;
  const parts = parsed.data.map((op) => {
    if (op.op === 'replaceBlock') return `replace block`;
    if (op.op === 'deleteBlock') return `delete block`;
    return `insert block`;
  });
  return parts.length > 0 ? parts.join(', ') : null;
}

function mapSuggestionRow(row: SuggestionWithDocument): ReviewSuggestionItem {
  const owner =
    row.document.context?.process?.owner ??
    row.document.context?.project?.owner ??
    row.document.context?.subcontext?.project?.owner ??
    null;
  const scope = getScopeFromOwner(owner);
  return {
    suggestionId: row.id,
    documentId: row.documentId,
    documentTitle: row.document.title,
    status: row.status,
    authorId: row.authorId,
    authorName: row.author.name,
    createdAt: row.createdAt.toISOString(),
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    scopeName: scope.scopeName,
    baseDraftRevision: row.baseDraftRevision,
    affectedBlockSummary: summarizeSuggestionOps(row.ops),
  };
}

const activeDocumentWhere = {
  deletedAt: null,
  archivedAt: null,
} as const;

export async function listMeReviews(
  prisma: PrismaClient,
  userId: string,
  query: MeReviewsQuery
): Promise<MeReviewsResult> {
  const { isAdmin, contextIds } = await getPublishableContextIds(prisma, userId);

  const leadDocumentWhere = isAdmin
    ? activeDocumentWhere
    : contextIds.length > 0
      ? { ...activeDocumentWhere, contextId: { in: contextIds } }
      : { id: { in: [] as string[] } };

  const [pendingRows, totalPendingForReview, myRows, totalMySuggestions] = await Promise.all([
    prisma.documentSuggestion.findMany({
      where: {
        status: DocumentSuggestionStatus.pending,
        document: leadDocumentWhere,
      },
      include: {
        author: { select: { id: true, name: true } },
        document: { select: documentSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    }),
    prisma.documentSuggestion.count({
      where: {
        status: DocumentSuggestionStatus.pending,
        document: leadDocumentWhere,
      },
    }),
    prisma.documentSuggestion.findMany({
      where: {
        authorId: userId,
        status: query.status as DocumentSuggestionStatus,
        document: activeDocumentWhere,
      },
      include: {
        author: { select: { id: true, name: true } },
        document: { select: documentSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    }),
    prisma.documentSuggestion.count({
      where: {
        authorId: userId,
        status: query.status as DocumentSuggestionStatus,
        document: activeDocumentWhere,
      },
    }),
  ]);

  return {
    pendingForReview: pendingRows.map((row) => mapSuggestionRow(row as SuggestionWithDocument)),
    mySuggestions: myRows.map((row) => mapSuggestionRow(row as SuggestionWithDocument)),
    totalPendingForReview,
    totalMySuggestions,
    limit: query.limit,
    offset: query.offset,
  };
}
