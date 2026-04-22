import { parseBlockDocumentFromDb } from '../../documents/services/documentBlocksBackfill.js';
import { blockDocumentV0ToSearchableText } from '../../documents/services/blocksPlaintext.js';

export type SearchIndexBodySource = {
  draftBlocks: unknown;
  currentPublishedVersion: { blocks: unknown } | null;
};

/**
 * Text für FTS-Index (`document_search_index.content`) und tsvector: zuerst Published-`blocks`,
 * sonst Lead-`draftBlocks` (EPIC-9b: kein Markdown-Feld mehr).
 */
export function resolveSearchIndexBodyText(source: SearchIndexBodySource): string {
  const pubParsed = parseBlockDocumentFromDb(source.currentPublishedVersion?.blocks ?? null);
  if (pubParsed) return blockDocumentV0ToSearchableText(pubParsed);

  const draftParsed = parseBlockDocumentFromDb(source.draftBlocks);
  if (draftParsed) return blockDocumentV0ToSearchableText(draftParsed);

  return '';
}
