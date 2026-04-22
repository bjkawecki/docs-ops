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

export type BlockDocumentV0 = z.infer<typeof blockDocumentSchemaV0>;

export function parseBlockDocumentV0(input: unknown): BlockDocumentV0 {
  return blockDocumentSchemaV0.parse(input);
}

export function safeParseBlockDocumentV0(input: unknown) {
  return blockDocumentSchemaV0.safeParse(input);
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
