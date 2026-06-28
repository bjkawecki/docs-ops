import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearDraftPresenceRegistryForTests,
  listDraftEditorPresence,
  registerDraftEditorPresence,
  unregisterDraftEditorPresence,
} from './draftPresenceRegistry.js';

describe('draftPresenceRegistry', () => {
  beforeEach(() => {
    clearDraftPresenceRegistryForTests();
  });

  it('unregisterDraftEditorPresence removes user from document editors', () => {
    const docId = 'doc-1';
    registerDraftEditorPresence(docId, 'user-a', 'Alice');
    registerDraftEditorPresence(docId, 'user-b', 'Bob');
    expect(
      listDraftEditorPresence(docId)
        .map((e) => e.userId)
        .sort()
    ).toEqual(['user-a', 'user-b']);

    unregisterDraftEditorPresence(docId, 'user-a');
    expect(listDraftEditorPresence(docId).map((e) => e.userId)).toEqual(['user-b']);
  });
});
