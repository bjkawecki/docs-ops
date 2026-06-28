import type { BlockDocument } from '../api/document-types.js';

/** Count pending inline suggestion marks in a block document. */
export function countPendingSuggestions(doc: BlockDocument): number {
  let count = 0;
  const walk = (nodes: BlockDocument['blocks']) => {
    for (const block of nodes) {
      if (block.type === 'paragraph' || block.type === 'heading') {
        for (const leaf of block.content ?? []) {
          if (leaf.type !== 'text') continue;
          const raw = leaf.meta?.suggestion;
          if (!raw || typeof raw !== 'object') continue;
          const s = raw as Record<string, unknown>;
          if (s.status === 'pending') count += 1;
        }
      }
      if (block.content) walk(block.content);
    }
  };
  walk(doc.blocks);
  return count;
}

/** Whether a pending suggestion id exists in the last synced server document. */
export function isSuggestionPersisted(doc: BlockDocument, suggestionId: string): boolean {
  const walk = (nodes: BlockDocument['blocks']): boolean => {
    for (const block of nodes) {
      if (block.type === 'paragraph' || block.type === 'heading') {
        for (const leaf of block.content ?? []) {
          if (leaf.type !== 'text') continue;
          const raw = leaf.meta?.suggestion;
          if (!raw || typeof raw !== 'object') continue;
          const s = raw as Record<string, unknown>;
          if (s.id === suggestionId && s.status === 'pending') return true;
        }
      }
      if (block.content && walk(block.content)) return true;
    }
    return false;
  };
  return walk(doc.blocks);
}
