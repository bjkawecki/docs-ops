import { z } from 'zod';
import { blockNodeSchema, type BlockDocumentV0, type BlockNode } from './blockSchema.js';

/**
 * Einzelne Suggestion-Operation (EPIC-5 / PR-5c, ADR 001).
 * v0: nur Top-Level-`blocks[]` des Lead-Drafts (keine verschachtelten Block-IDs).
 */
export const suggestionReplaceBlockOpSchema = z.object({
  op: z.literal('replaceBlock'),
  blockId: z.string().min(1),
  block: blockNodeSchema,
});

export const suggestionInsertAfterOpSchema = z.object({
  op: z.literal('insertAfter'),
  afterBlockId: z.string().min(1),
  blocks: z.array(blockNodeSchema).min(1),
});

export const suggestionDeleteBlockOpSchema = z.object({
  op: z.literal('deleteBlock'),
  blockId: z.string().min(1),
});

export const suggestionOpSchema = z.discriminatedUnion('op', [
  suggestionReplaceBlockOpSchema,
  suggestionInsertAfterOpSchema,
  suggestionDeleteBlockOpSchema,
]);

export type SuggestionOp = z.infer<typeof suggestionOpSchema>;

export const suggestionOpsArraySchema = z.array(suggestionOpSchema).min(1);

export function parseSuggestionOps(
  input: unknown
): ReturnType<typeof suggestionOpsArraySchema.safeParse> {
  return suggestionOpsArraySchema.safeParse(input);
}

function findTopLevelIndex(blocks: BlockNode[], blockId: string): number {
  return blocks.findIndex((b) => b.id === blockId);
}

/**
 * Wendet Ops auf eine Kopie von `document` an (rein funktional).
 */
export function applySuggestionOpsToDocument(
  document: BlockDocumentV0,
  ops: SuggestionOp[]
): { ok: true; document: BlockDocumentV0 } | { ok: false; error: string } {
  const next: BlockDocumentV0 = structuredClone(document);
  for (const op of ops) {
    if (op.op === 'deleteBlock') {
      const idx = findTopLevelIndex(next.blocks, op.blockId);
      if (idx < 0)
        return {
          ok: false,
          error: `deleteBlock: Block "${op.blockId}" nicht gefunden (nur Top-Level).`,
        };
      next.blocks.splice(idx, 1);
    } else if (op.op === 'replaceBlock') {
      const idx = findTopLevelIndex(next.blocks, op.blockId);
      if (idx < 0)
        return {
          ok: false,
          error: `replaceBlock: Block "${op.blockId}" nicht gefunden (nur Top-Level).`,
        };
      next.blocks[idx] = op.block;
    } else if (op.op === 'insertAfter') {
      const idx = findTopLevelIndex(next.blocks, op.afterBlockId);
      if (idx < 0)
        return {
          ok: false,
          error: `insertAfter: Block "${op.afterBlockId}" nicht gefunden (nur Top-Level).`,
        };
      next.blocks.splice(idx + 1, 0, ...op.blocks);
    }
  }
  return { ok: true, document: next };
}
