import { describe, it, expect } from 'vitest';
import { parseBlockDocumentV0 } from '../services/blocks/blockSchema.js';
import { markdownToBlockDocumentV0 } from '../services/blocks/markdownToBlocks.js';
import { blockDocumentV0ToMarkdown } from '../services/blocks/blocksToMarkdown.js';
import { blockDocumentV0ToSearchableText } from '../services/blocks/blocksPlaintext.js';
import { exampleBlockDocumentV0 } from '../services/blocks/blockSchema.js';

describe('block serialization (EPIC-2)', () => {
  it('PR-2a: markdown round-trip output parses as v0 document', () => {
    const md = [
      '# Titel',
      '',
      'Ein Absatz.',
      '',
      '- Punkt a',
      '- Punkt b',
      '',
      '```ts',
      'const x = 1',
      '```',
    ].join('\n');
    const doc = markdownToBlockDocumentV0(md);
    expect(() => parseBlockDocumentV0(doc)).not.toThrow();
    const again = blockDocumentV0ToMarkdown(doc);
    const round = markdownToBlockDocumentV0(again);
    expect(round.schemaVersion).toBe(0);
    expect(round.blocks.length).toBeGreaterThanOrEqual(1);
  });

  it('PR-2b: heading and paragraph survive round-trip semantically', () => {
    const md = '# Hello\n\nWorld line.';
    const doc = markdownToBlockDocumentV0(md);
    const out = blockDocumentV0ToMarkdown(doc);
    expect(out).toContain('# Hello');
    expect(out).toContain('World line.');
  });

  it('PR-2c: searchable text includes visible words', () => {
    const text = blockDocumentV0ToSearchableText(exampleBlockDocumentV0);
    expect(text).toContain('Titel');
    expect(text).toContain('Absatztext');
  });
});
