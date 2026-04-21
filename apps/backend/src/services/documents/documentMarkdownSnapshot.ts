import { parseBlockDocumentFromDb } from './documentBlocksBackfill.js';
import { blockDocumentV0ToMarkdown } from './blocksToMarkdown.js';

/**
 * Markdown-Snapshot für API-`content`, Kommentar-Anker und PDF-Export (EPIC-9b: kein DB-Feld mehr).
 * Veröffentlicht: aus aktueller Version `blocks`; sonst aus Lead-`draftBlocks`.
 */
export function documentMarkdownFromRow(row: {
  publishedAt: Date | null;
  draftBlocks: unknown;
  currentPublishedVersion: { blocks: unknown } | null;
}): string {
  if (row.publishedAt != null) {
    const pub = parseBlockDocumentFromDb(row.currentPublishedVersion?.blocks ?? null);
    if (pub) return blockDocumentV0ToMarkdown(pub);
  }
  const draft = parseBlockDocumentFromDb(row.draftBlocks);
  return draft ? blockDocumentV0ToMarkdown(draft) : '';
}
