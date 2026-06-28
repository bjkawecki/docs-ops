import { describe, expect, it } from 'vitest';
import {
  blockDocumentToTiptapJson,
  ensureUniqueBlockIdsInDocument,
  tiptapJsonToBlockDocument,
} from './blockDocumentTiptap.js';
import type { BlockDocument, BlockDocumentV0 } from '../api/document-types';

function hasEmptyTextNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === 'text' && n.text === '') return true;
  return (n.content ?? []).some((child) => hasEmptyTextNode(child));
}

describe('blockDocumentToTiptapJson', () => {
  it('does not emit empty ProseMirror text nodes', () => {
    const doc: BlockDocumentV0 = {
      schemaVersion: 0,
      blocks: [
        {
          id: 'p1',
          type: 'paragraph',
          content: [{ id: 't1', type: 'text', attrs: {}, meta: { text: '' } }],
        },
        {
          id: 'h1',
          type: 'heading',
          attrs: { level: 2 },
          content: [{ id: 't2', type: 'text', attrs: {}, meta: { text: 'Title' } }],
        },
      ],
    };
    const json = blockDocumentToTiptapJson(doc);
    expect(hasEmptyTextNode(json)).toBe(false);
    const paragraph = json.content?.[0];
    expect(paragraph?.type).toBe('paragraph');
    expect(paragraph?.content).toEqual([]);
  });
});

describe('ensureUniqueBlockIdsInDocument', () => {
  it('assigns new ids for duplicate top-level blocks', () => {
    const doc: BlockDocumentV0 = {
      schemaVersion: 0,
      blocks: [
        {
          id: 'dup',
          type: 'paragraph',
          content: [{ id: 't1', type: 'text', meta: { text: 'A' } }],
        },
        {
          id: 'dup',
          type: 'paragraph',
          content: [{ id: 't2', type: 'text', meta: { text: 'B' } }],
        },
      ],
    };
    const fixed = ensureUniqueBlockIdsInDocument(doc);
    const ids = fixed.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe('dup');
    expect(ids[1]).not.toBe('dup');
  });
});

describe('tiptapJsonToBlockDocument', () => {
  it('deduplicates blockIds copied by ProseMirror split', () => {
    const sharedId = 'e01a04be-6e45-4e5d-81c9-700b507324c4';
    const doc = tiptapJsonToBlockDocument({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { blockId: sharedId }, content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', attrs: { blockId: sharedId }, content: [{ type: 'text', text: 'B' }] },
      ],
    });
    const ids = doc.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('preserves bold/italic/code marks as schema v1', () => {
    const doc = tiptapJsonToBlockDocument({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'p1' },
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    });
    expect(doc.schemaVersion).toBe(1);
    const textNodes = doc.blocks[0]?.content ?? [];
    expect(
      textNodes.some((n) => Array.isArray(n.meta?.marks) && n.meta.marks.includes('bold'))
    ).toBe(true);
  });

  it('roundtrips marks through tiptap json', () => {
    const source: BlockDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: 'p1',
          type: 'paragraph',
          content: [
            { id: 't1', type: 'text', meta: { text: 'bold bit', marks: ['bold'] } },
            { id: 't2', type: 'text', meta: { text: ' normal' } },
          ],
        },
      ],
    };
    const json = blockDocumentToTiptapJson(source);
    const back = tiptapJsonToBlockDocument(json);
    expect(back.schemaVersion).toBe(1);
    expect(back.blocks[0]?.content?.[0]?.meta?.marks).toEqual(['bold']);
  });

  it('roundtrips canon with pending insert suggestion without changing block ids', () => {
    const source: BlockDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: 'p1',
          type: 'paragraph',
          content: [
            { id: 't1', type: 'text', meta: { text: 'Hello' } },
            {
              id: 't2',
              type: 'text',
              meta: {
                text: ' world',
                suggestion: {
                  id: 's1',
                  kind: 'insert',
                  authorId: 'author-a',
                  status: 'pending',
                  createdAt: '2026-06-16T10:00:00.000Z',
                },
              },
            },
          ],
        },
      ],
    };
    const json = blockDocumentToTiptapJson(source);
    const back = tiptapJsonToBlockDocument(json);
    expect(back.blocks.map((b) => b.id)).toEqual(['p1']);
    expect(back.blocks[0]?.content?.[0]?.meta?.text).toBe('Hello');
    expect(back.blocks[0]?.content?.[1]?.meta?.suggestion).toMatchObject({
      id: 's1',
      kind: 'insert',
      authorId: 'author-a',
      status: 'pending',
    });
    expect(back.blocks[0]?.content?.[0]?.meta?.suggestion).toBeUndefined();
  });

  it('omits empty paragraphs without suggestions from export', () => {
    const doc = tiptapJsonToBlockDocument({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'p1' },
          content: [{ type: 'text', text: 'Hello' }],
        },
        { type: 'paragraph', attrs: { blockId: 'p-empty' }, content: [] },
        {
          type: 'paragraph',
          attrs: { blockId: 'p2' },
          content: [
            {
              type: 'text',
              text: 'New',
              marks: [
                {
                  type: 'suggestionInsert',
                  attrs: {
                    suggestionId: 's1',
                    authorId: 'a1',
                    createdAt: '2026-06-16T10:00:00.000Z',
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(doc.blocks.map((b) => b.id)).toEqual(['p1', 'p2']);
    expect(doc.blocks).toHaveLength(2);
  });
});
