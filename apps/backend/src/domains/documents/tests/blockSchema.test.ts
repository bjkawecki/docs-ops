import { describe, it, expect } from 'vitest';
import {
  exampleBlockDocumentV0,
  parseBlockDocumentV0,
  safeParseBlockDocumentV0,
  safeParseBlockDocument,
  normalizeBlockDocumentSchemaVersion,
  blockDocumentUsesInlineMarks,
} from '../services/blocks/blockSchema.js';

describe('blockSchema v0', () => {
  it('parses the bundled example', () => {
    const parsed = parseBlockDocumentV0(exampleBlockDocumentV0);
    expect(parsed.schemaVersion).toBe(0);
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks[0]?.type).toBe('heading');
  });

  it('rejects wrong schemaVersion for v0-only parser', () => {
    const bad = { schemaVersion: 1, blocks: [] };
    const r = safeParseBlockDocumentV0(bad);
    expect(r.success).toBe(false);
  });

  it('rejects empty block id', () => {
    const bad = { schemaVersion: 0, blocks: [{ id: '', type: 'paragraph' }] };
    const r = safeParseBlockDocumentV0(bad);
    expect(r.success).toBe(false);
  });
});

describe('blockSchema v1', () => {
  it('accepts v1 documents via union parser', () => {
    const doc = {
      schemaVersion: 1 as const,
      blocks: [
        {
          id: 'p1',
          type: 'paragraph',
          content: [
            {
              id: 't1',
              type: 'text',
              meta: { text: 'Hello', marks: ['bold'] },
            },
          ],
        },
      ],
    };
    const r = safeParseBlockDocument(doc);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.schemaVersion).toBe(1);
  });

  it('normalizes to v1 when marks are present', () => {
    const doc = {
      schemaVersion: 0 as const,
      blocks: [
        {
          id: 'p1',
          type: 'paragraph',
          content: [{ id: 't1', type: 'text', meta: { text: 'x', marks: ['italic'] } }],
        },
      ],
    };
    expect(blockDocumentUsesInlineMarks(doc)).toBe(true);
    const normalized = normalizeBlockDocumentSchemaVersion(doc);
    expect(normalized.schemaVersion).toBe(1);
  });

  it('keeps v0 when no marks', () => {
    const normalized = normalizeBlockDocumentSchemaVersion(exampleBlockDocumentV0);
    expect(normalized.schemaVersion).toBe(0);
  });
});
