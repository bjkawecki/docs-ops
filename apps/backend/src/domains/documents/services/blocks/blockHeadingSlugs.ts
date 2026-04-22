import type { BlockNode } from './blockSchema.js';
import { parseBlockDocumentFromDb } from './documentBlocksBackfill.js';

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u00C0-\u024F-]/g, '');
}

function nodeText(node: BlockNode): string {
  const ownText = typeof node.meta?.text === 'string' ? node.meta.text : '';
  const children = Array.isArray(node.content) ? node.content.map(nodeText).join('') : '';
  return ownText + children;
}

function collectHeadingSlugs(node: BlockNode, counts: Map<string, number>, ids: Set<string>): void {
  if (node.type === 'heading') {
    const base = slugify(nodeText(node)) || 'heading';
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    ids.add(n === 1 ? base : `${base}-${n}`);
  }
  if (!Array.isArray(node.content)) return;
  for (const child of node.content) collectHeadingSlugs(child, counts, ids);
}

export function listHeadingSlugsFromBlocks(blocksJson: unknown): Set<string> {
  const parsed = parseBlockDocumentFromDb(blocksJson);
  if (!parsed) return new Set<string>();
  const counts = new Map<string, number>();
  const ids = new Set<string>();
  for (const block of parsed.blocks) collectHeadingSlugs(block, counts, ids);
  return ids;
}

export function isHeadingSlugInBlocks(blocksJson: unknown, slug: string): boolean {
  return listHeadingSlugsFromBlocks(blocksJson).has(slug);
}
