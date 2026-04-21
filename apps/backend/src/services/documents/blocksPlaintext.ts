import type { BlockDocumentV0, BlockNode } from './blockSchema.js';

/**
 * Rekursiv Plaintext aus Block-Baum (EPIC-2 / PR-2c, Vorbereitung FTS in EPIC-7).
 * Blockgrenzen als doppelte Zeilenumbrüche, innerhalb von Absätzen Leerzeichen.
 */
export function blockDocumentV0ToSearchableText(doc: BlockDocumentV0): string {
  return doc.blocks
    .map((b) => blockNodeToSearchableText(b))
    .filter((s) => s.length > 0)
    .join('\n\n');
}

function blockNodeToSearchableText(node: BlockNode): string {
  if (node.type === 'text') {
    const t = node.meta?.text;
    return typeof t === 'string' ? t : '';
  }
  if (!node.content?.length) return '';
  const sep = node.type === 'paragraph' || node.type === 'heading' ? ' ' : '\n';
  return node.content
    .map(blockNodeToSearchableText)
    .filter((s) => s.length > 0)
    .join(sep);
}
