import type { BlockDocumentV0 } from '../../../api/document-types.js';

export const POLL_MS = 15_000;

export const emptyDoc: BlockDocumentV0 = {
  schemaVersion: 0,
  blocks: [
    {
      id: 'initial-paragraph',
      type: 'paragraph',
      content: [{ id: 'initial-text', type: 'text', attrs: {}, meta: { text: '' } }],
    },
  ],
};
