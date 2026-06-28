import type { BlockDocumentV0 } from '../../../api/document-types.js';

export const POLL_MS = 15_000;

/** Fallback poll for draft presence when SSE is primary (caps stale UI). */
export const PRESENCE_POLL_MS = 10_000;

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
