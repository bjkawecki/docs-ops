import { describe, it, expect } from 'vitest';
import {
  exampleBlockDocumentV0,
  parseBlockDocumentV0,
  safeParseBlockDocumentV0,
} from './blockSchema.js';

describe('blockSchema v0', () => {
  it('parses the bundled example', () => {
    const parsed = parseBlockDocumentV0(exampleBlockDocumentV0);
    expect(parsed.schemaVersion).toBe(0);
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks[0]?.type).toBe('heading');
  });

  it('rejects wrong schemaVersion', () => {
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
