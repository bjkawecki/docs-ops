import { parseBlockDocumentFromDb } from '../documents/documentBlocksBackfill.js';
import { blockDocumentV0ToSearchableText } from '../documents/blocksPlaintext.js';

export type SearchIndexBodySource = {
  content: string;
  draftBlocks: unknown;
  currentPublishedVersion: { blocks: unknown } | null;
};

/**
 * Text für FTS-Index (`document_search_index.content`) und tsvector: zuerst Published-`blocks`,
 * sonst Lead-`draftBlocks`, sonst Markdown-`content` (EPIC-7 / PR-7a).
 */
export function resolveSearchIndexBodyText(source: SearchIndexBodySource): string {
  const pubParsed = parseBlockDocumentFromDb(source.currentPublishedVersion?.blocks ?? null);
  if (pubParsed) return blockDocumentV0ToSearchableText(pubParsed);

  const draftParsed = parseBlockDocumentFromDb(source.draftBlocks);
  if (draftParsed) return blockDocumentV0ToSearchableText(draftParsed);

  return source.content ?? '';
}
