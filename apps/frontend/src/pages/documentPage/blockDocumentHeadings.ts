import type { BlockDocumentV0, BlockNodeV0 } from '../../api/document-types';

/** Gleiche Regel wie Backend `blockHeadingSlugs.ts` (Kommentar-Anker-Validierung). */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u00C0-\u024F-]/g, '');
}

/** Wie Backend `nodeText` — Kindelemente ohne Separator verketten. */
export function nodeText(node: BlockNodeV0): string {
  const ownText = typeof node.meta?.text === 'string' ? node.meta.text : '';
  const children = Array.isArray(node.content) ? node.content.map(nodeText).join('') : '';
  return ownText + children;
}

function headingLevel(attrs: Record<string, unknown> | undefined): number {
  const raw = attrs?.level;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    if (n >= 1 && n <= 6) return n;
  }
  return 2;
}

function collectFromNode(
  node: BlockNodeV0,
  counts: Map<string, number>,
  headings: { level: number; text: string; id: string }[],
  anchorIdByBlockNodeId: Map<string, string>
): void {
  if (node.type === 'heading') {
    const base = slugify(nodeText(node)) || 'heading';
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    const raw = nodeText(node).trim();
    headings.push({
      level: headingLevel(node.attrs),
      text: raw.length > 0 ? raw : '(Untitled)',
      id,
    });
    anchorIdByBlockNodeId.set(node.id, id);
  }
  if (!Array.isArray(node.content)) return;
  for (const child of node.content) collectFromNode(child, counts, headings, anchorIdByBlockNodeId);
}

export type BlockDocumentHeadingData = {
  headings: { level: number; text: string; id: string }[];
  anchorIdByBlockNodeId: ReadonlyMap<string, string>;
};

/**
 * Überschriftenliste (TOC) und Anker-IDs pro Heading-Block — Reihenfolge/Slugs wie Backend
 * {@link apps/backend/src/domains/documents/services/blocks/blockHeadingSlugs.ts}.
 */
export function getBlockDocumentHeadingData(
  doc: BlockDocumentV0 | null | undefined
): BlockDocumentHeadingData {
  if (!doc?.blocks?.length) {
    return { headings: [], anchorIdByBlockNodeId: new Map() };
  }
  const counts = new Map<string, number>();
  const headings: { level: number; text: string; id: string }[] = [];
  const anchorIdByBlockNodeId = new Map<string, string>();
  for (const block of doc.blocks) collectFromNode(block, counts, headings, anchorIdByBlockNodeId);
  return { headings, anchorIdByBlockNodeId };
}
