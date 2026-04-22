type SuggestionRow = {
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
};

export function serializeDocumentSuggestion(row: SuggestionRow) {
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
