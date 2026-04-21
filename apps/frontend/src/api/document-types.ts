/**
 * Block-JSON v0 (Edit-System) – deckungsgleich mit Backend `blockSchema` / GET /documents.
 */
export type BlockNodeV0 = {
  id: string;
  type: string;
  attrs?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  content?: BlockNodeV0[];
};

export type BlockDocumentV0 = {
  schemaVersion: 0;
  blocks: BlockNodeV0[];
};

/** GET /api/v1/documents/:id – Block-Felder (Lead-Draft / Published). */
export type DocumentBlocksFields = {
  draftRevision: number;
  blocks: BlockDocumentV0 | null;
  publishedBlocks: BlockDocumentV0 | null;
  publishedBlocksSchemaVersion: number | null;
};

/** GET /api/v1/documents/:id/lead-draft */
export type LeadDraftResponse = {
  draftRevision: number;
  blocks: BlockDocumentV0 | null;
  canEdit: boolean;
};

/** GET/POST /api/v1/documents/:id/suggestions */
export type DocumentSuggestionItem = {
  id: string;
  documentId: string;
  authorId: string;
  authorName: string | null;
  status: string;
  baseDraftRevision: number;
  publishedVersionId: string | null;
  ops: unknown;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolvedByName: string | null;
  comment: string | null;
};

export type SuggestionOpDeleteBlock = { op: 'deleteBlock'; blockId: string };
export type SuggestionOpReplaceBlock = {
  op: 'replaceBlock';
  blockId: string;
  block: BlockNodeV0;
};
export type SuggestionOpInsertAfter = {
  op: 'insertAfter';
  afterBlockId: string;
  blocks: BlockNodeV0[];
};
export type SuggestionOp =
  | SuggestionOpDeleteBlock
  | SuggestionOpReplaceBlock
  | SuggestionOpInsertAfter;
