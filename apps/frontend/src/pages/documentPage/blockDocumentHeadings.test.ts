import { describe, it, expect } from 'vitest';
import type { BlockDocumentV0, BlockNodeV0 } from '../../api/document-types';
import { getBlockDocumentHeadingData, nodeText, slugify } from './blockDocumentHeadings';

describe('blockDocumentHeadings', () => {
  it('slugify matches heading text', () => {
    expect(slugify('Intro')).toBe('intro');
  });

  it('nodeText joins heading child text', () => {
    const node: BlockNodeV0 = {
      id: 'h1',
      type: 'heading',
      attrs: { level: 1 },
      content: [{ id: 't1', type: 'text', meta: { text: 'Intro' } }],
    };
    expect(nodeText(node)).toBe('Intro');
  });

  it('single heading yields id intro (parity with backend comment tests)', () => {
    const doc: BlockDocumentV0 = {
      schemaVersion: 0,
      blocks: [
        {
          id: 'b1',
          type: 'heading',
          attrs: { level: 1 },
          content: [{ id: 't1', type: 'text', meta: { text: 'Intro' } }],
        },
        {
          id: 'b2',
          type: 'paragraph',
          content: [{ id: 't2', type: 'text', meta: { text: 'Published content' } }],
        },
      ],
    };
    const { headings, anchorIdByBlockNodeId } = getBlockDocumentHeadingData(doc);
    expect(headings).toEqual([{ level: 1, text: 'Intro', id: 'intro' }]);
    expect(anchorIdByBlockNodeId.get('b1')).toBe('intro');
  });

  it('duplicate titles get numbered slugs', () => {
    const doc: BlockDocumentV0 = {
      schemaVersion: 0,
      blocks: [
        {
          id: 'a',
          type: 'heading',
          attrs: { level: 2 },
          content: [{ id: 'a1', type: 'text', meta: { text: 'Foo' } }],
        },
        {
          id: 'b',
          type: 'heading',
          attrs: { level: 2 },
          content: [{ id: 'b1', type: 'text', meta: { text: 'Foo' } }],
        },
      ],
    };
    const { headings, anchorIdByBlockNodeId } = getBlockDocumentHeadingData(doc);
    expect(headings.map((h) => h.id)).toEqual(['foo', 'foo-2']);
    expect(anchorIdByBlockNodeId.get('a')).toBe('foo');
    expect(anchorIdByBlockNodeId.get('b')).toBe('foo-2');
  });

  it('nested heading under list_item is collected', () => {
    const doc: BlockDocumentV0 = {
      schemaVersion: 0,
      blocks: [
        {
          id: 'list',
          type: 'bullet_list',
          content: [
            {
              id: 'li',
              type: 'list_item',
              content: [
                {
                  id: 'nh',
                  type: 'heading',
                  attrs: { level: 3 },
                  content: [{ id: 'nt', type: 'text', meta: { text: 'Nested' } }],
                },
              ],
            },
          ],
        },
      ],
    };
    const { headings, anchorIdByBlockNodeId } = getBlockDocumentHeadingData(doc);
    expect(headings).toHaveLength(1);
    expect(headings[0]?.id).toBe('nested');
    expect(anchorIdByBlockNodeId.get('nh')).toBe('nested');
  });
});
