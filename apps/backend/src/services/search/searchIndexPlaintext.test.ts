import { describe, it, expect } from 'vitest';
import { exampleBlockDocumentV0 } from '../documents/blockSchema.js';
import { resolveSearchIndexBodyText } from './searchIndexPlaintext.js';

describe('searchIndexPlaintext (EPIC-7)', () => {
  it('Published-Blocks haben Vorrang vor Draft', () => {
    const publishedOnly = {
      schemaVersion: 0 as const,
      blocks: [
        {
          id: 'p1',
          type: 'paragraph',
          content: [{ id: 't1', type: 'text', attrs: {}, meta: { text: 'PublishedUniquePhrase' } }],
        },
      ],
    };
    const t = resolveSearchIndexBodyText({
      content: 'markdown only',
      draftBlocks: exampleBlockDocumentV0,
      currentPublishedVersion: { blocks: publishedOnly },
    });
    expect(t).toContain('PublishedUniquePhrase');
    expect(t).not.toContain('Absatztext');
  });

  it('ohne Published: Draft-Blocks', () => {
    const t = resolveSearchIndexBodyText({
      content: 'ignored',
      draftBlocks: exampleBlockDocumentV0,
      currentPublishedVersion: null,
    });
    expect(t.length).toBeGreaterThan(0);
    expect(t).toContain('Titel');
    expect(t).toContain('Absatztext');
  });

  it('Fallback: Markdown content', () => {
    const t = resolveSearchIndexBodyText({
      content: '**Only** markdown',
      draftBlocks: null,
      currentPublishedVersion: null,
    });
    expect(t).toBe('**Only** markdown');
  });
});
