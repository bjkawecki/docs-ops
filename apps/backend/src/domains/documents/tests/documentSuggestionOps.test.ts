import { describe, it, expect } from 'vitest';
import { exampleBlockDocumentV0 } from '../services/blockSchema.js';
import {
  applySuggestionOpsToDocument,
  suggestionOpsArraySchema,
} from '../services/documentSuggestionOps.js';

describe('documentSuggestionOps (EPIC-5)', () => {
  it('suggestionOpsArraySchema lehnt leeres Array ab', () => {
    expect(() => suggestionOpsArraySchema.parse([])).toThrow();
  });

  it('deleteBlock entfernt Top-Level-Block', () => {
    const doc = structuredClone(exampleBlockDocumentV0);
    const r = applySuggestionOpsToDocument(doc, [
      { op: 'deleteBlock', blockId: '550e8400-e29b-41d4-a716-446655440002' },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.document.blocks.map((b) => b.id)).not.toContain(
      '550e8400-e29b-41d4-a716-446655440002'
    );
    expect(r.document.blocks.length).toBe(1);
  });

  it('insertAfter fügt nach Block ein', () => {
    const doc = structuredClone(exampleBlockDocumentV0);
    const r = applySuggestionOpsToDocument(doc, [
      {
        op: 'insertAfter',
        afterBlockId: '550e8400-e29b-41d4-a716-446655440000',
        blocks: [
          {
            id: 'new-block-1',
            type: 'paragraph',
            content: [
              {
                id: 'new-text-1',
                type: 'text',
                attrs: {},
                meta: { text: 'Neu' },
              },
            ],
          },
        ],
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.document.blocks.map((b) => b.id)).toEqual([
      '550e8400-e29b-41d4-a716-446655440000',
      'new-block-1',
      '550e8400-e29b-41d4-a716-446655440002',
    ]);
  });

  it('replaceBlock ersetzt Top-Level-Block', () => {
    const doc = structuredClone(exampleBlockDocumentV0);
    const replacement = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      type: 'paragraph',
      content: [
        {
          id: '550e8400-e29b-41d4-a716-446655440003',
          type: 'text',
          attrs: {},
          meta: { text: 'Ersetzt.' },
        },
      ],
    };
    const r = applySuggestionOpsToDocument(doc, [
      { op: 'replaceBlock', blockId: '550e8400-e29b-41d4-a716-446655440002', block: replacement },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.document.blocks.find((b) => b.id === '550e8400-e29b-41d4-a716-446655440002');
    expect(p?.content?.[0]?.meta).toEqual({ text: 'Ersetzt.' });
  });

  it('verschachtelte Block-Id → Fehler (v0 nur Top-Level)', () => {
    const doc = structuredClone(exampleBlockDocumentV0);
    const r = applySuggestionOpsToDocument(doc, [
      { op: 'deleteBlock', blockId: '550e8400-e29b-41d4-a716-446655440003' },
    ]);
    expect(r.ok).toBe(false);
  });
});
