import { describe, expect, it } from 'vitest';
import { authorSelectionTouchesCanon } from './authorFormatGuards.js';

type MockMark = { type: { name: string }; attrs?: Record<string, unknown> };

function mockEditor(doc: {
  from: number;
  to: number;
  empty: boolean;
  textNodes: Array<{ from: number; to: number; marks: MockMark[] }>;
  cursorMarks?: MockMark[];
}) {
  return {
    state: {
      selection: { from: doc.from, to: doc.to, empty: doc.empty },
      doc: {
        resolve() {
          return { marks: () => doc.cursorMarks ?? [] };
        },
        nodesBetween(
          from: number,
          to: number,
          callback: (node: { isText: boolean; marks: MockMark[] }) => void
        ) {
          for (const segment of doc.textNodes) {
            if (segment.from >= to || segment.to <= from) continue;
            callback({ isText: true, marks: segment.marks });
          }
        },
      },
    },
  } as Parameters<typeof authorSelectionTouchesCanon>[0];
}

describe('authorSelectionTouchesCanon', () => {
  it('returns true when cursor is in canon text', () => {
    const editor = mockEditor({
      from: 5,
      to: 5,
      empty: true,
      textNodes: [],
      cursorMarks: [],
    });
    expect(authorSelectionTouchesCanon(editor)).toBe(true);
  });

  it('returns false when cursor is in own insert suggestion', () => {
    const editor = mockEditor({
      from: 5,
      to: 5,
      empty: true,
      textNodes: [],
      cursorMarks: [{ type: { name: 'suggestionInsert' }, attrs: { authorId: 'a1' } }],
    });
    expect(authorSelectionTouchesCanon(editor)).toBe(false);
  });

  it('returns true when selection spans canon text', () => {
    const editor = mockEditor({
      from: 1,
      to: 10,
      empty: false,
      textNodes: [
        {
          from: 1,
          to: 6,
          marks: [{ type: { name: 'suggestionInsert' } }],
        },
        {
          from: 6,
          to: 10,
          marks: [],
        },
      ],
    });
    expect(authorSelectionTouchesCanon(editor)).toBe(true);
  });
});
