import { z } from 'zod';

/**
 * Recursive block tree for Edit-System v0 (ADR 001, EPIC-0 / PR-0c).
 * `schemaVersion` 0 is the initial contract; bump only with migrations + ADR update.
 */
export interface BlockNode {
  id: string;
  type: string;
  attrs?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  content?: BlockNode[];
}

export const blockNodeSchema: z.ZodType<BlockNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    attrs: z.record(z.string(), z.unknown()).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
    content: z.array(blockNodeSchema).optional(),
  })
);

export const blockDocumentSchemaV0 = z.object({
  schemaVersion: z.literal(0),
  blocks: z.array(blockNodeSchema),
});

export const blockTextMarkSchema = z.enum(['bold', 'italic', 'code']);

export const blockTextMetaSchema = z
  .object({
    text: z.string(),
    marks: z.array(blockTextMarkSchema).optional(),
  })
  .passthrough();

/** Block document v1: same tree as v0; text nodes may carry inline `marks` in meta (ADR 002). */
export const blockDocumentSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  blocks: z.array(blockNodeSchema),
});

export const blockDocumentSchema = z.union([blockDocumentSchemaV0, blockDocumentSchemaV1]);

export type BlockDocumentV0 = z.infer<typeof blockDocumentSchemaV0>;
export type BlockDocumentV1 = z.infer<typeof blockDocumentSchemaV1>;
export type BlockDocument = BlockDocumentV0 | BlockDocumentV1;

export function parseBlockDocumentV0(input: unknown): BlockDocumentV0 {
  return blockDocumentSchemaV0.parse(input);
}

export function safeParseBlockDocumentV0(input: unknown) {
  return blockDocumentSchemaV0.safeParse(input);
}

export function safeParseBlockDocumentV1(input: unknown) {
  return blockDocumentSchemaV1.safeParse(input);
}

export function safeParseBlockDocument(input: unknown) {
  return blockDocumentSchema.safeParse(input);
}

export function parseBlockDocument(input: unknown): BlockDocument {
  return blockDocumentSchema.parse(input);
}

/** True when document uses v1 or any text node carries marks. */
export function blockDocumentUsesInlineMarks(doc: BlockDocument): boolean {
  if (doc.schemaVersion === 1) return true;
  const walk = (node: BlockNode): boolean => {
    if (node.type === 'text') {
      const marks = node.meta?.marks;
      return Array.isArray(marks) && marks.length > 0;
    }
    return (node.content ?? []).some(walk);
  };
  return doc.blocks.some(walk);
}

export function normalizeBlockDocumentSchemaVersion(doc: BlockDocument): BlockDocument {
  return blockDocumentUsesInlineMarks(doc)
    ? { schemaVersion: 1, blocks: doc.blocks }
    : { schemaVersion: 0, blocks: doc.blocks };
}

/** Minimal example used in tests and docs; not a full editor schema. */
export const exampleBlockDocumentV0: BlockDocumentV0 = {
  schemaVersion: 0,
  blocks: [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'heading',
      attrs: { level: 1 },
      content: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          type: 'text',
          attrs: {},
          meta: { text: 'Titel' },
        },
      ],
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      type: 'paragraph',
      content: [
        {
          id: '550e8400-e29b-41d4-a716-446655440003',
          type: 'text',
          attrs: {},
          meta: { text: 'Absatztext.' },
        },
      ],
    },
  ],
};
