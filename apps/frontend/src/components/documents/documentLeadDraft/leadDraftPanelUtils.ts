import type { BlockDocumentV0 } from '../../../api/document-types.js';
import { innerTextFromBlockNode } from '../../../lib/blockDocumentTiptap.js';

export function affectedBlockIds(ops: unknown): string[] {
  if (!Array.isArray(ops)) return [];
  const ids: string[] = [];
  for (const op of ops) {
    if (op == null || typeof op !== 'object') continue;
    const r = op as Record<string, unknown>;
    if (r.op === 'deleteBlock' || r.op === 'replaceBlock') {
      if (typeof r.blockId === 'string') ids.push(r.blockId);
    }
    if (r.op === 'insertAfter' && typeof r.afterBlockId === 'string') ids.push(r.afterBlockId);
  }
  return [...new Set(ids)];
}

export function blockLabel(doc: BlockDocumentV0, blockId: string): string {
  const b = doc.blocks.find((x) => x.id === blockId);
  if (!b) return blockId;
  const text = innerTextFromBlockNode(b).trim();
  return text.length > 0 ? text.slice(0, 64) : `${b.type} (${blockId.slice(0, 6)})`;
}

function nodeHasVisibleText(node: unknown): boolean {
  if (node == null || typeof node !== 'object') return false;
  const rec = node as Record<string, unknown>;
  const meta = rec.meta;
  if (meta != null && typeof meta === 'object') {
    const text = (meta as Record<string, unknown>).text;
    if (typeof text === 'string' && text.trim().length > 0) return true;
  }
  const content = rec.content;
  if (Array.isArray(content)) {
    return content.some((child) => nodeHasVisibleText(child));
  }
  return false;
}

export function isDocumentEffectivelyEmpty(doc: BlockDocumentV0 | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.blocks) || doc.blocks.length === 0) return true;
  return !doc.blocks.some((block) => nodeHasVisibleText(block));
}
