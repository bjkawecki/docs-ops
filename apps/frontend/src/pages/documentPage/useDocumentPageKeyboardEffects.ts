import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { DocumentLeadDraftPanelHandle } from '../../components/documents/DocumentLeadDraftPanel';
import type { DocumentSuggestionsPanelHandle } from '../../components/documents/DocumentSuggestionsPanel';

export function useDocumentPageKeyboardEffects(args: {
  mode: 'view' | 'edit';
  editTab: 'draft' | 'suggestions' | 'metadata' | 'access';
  leadDraftPanelRef: RefObject<DocumentLeadDraftPanelHandle | null>;
  suggestionsPanelRef: RefObject<DocumentSuggestionsPanelHandle | null>;
  handleSave: () => Promise<void>;
}) {
  const { mode, editTab, leadDraftPanelRef, suggestionsPanelRef, handleSave } = args;
  const handleSaveShortcutRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    handleSaveShortcutRef.current = handleSave;
  }, [handleSave]);

  useEffect(() => {
    if (mode !== 'edit') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const withMeta = event.metaKey || event.ctrlKey;
      if (!withMeta) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (editTab === 'draft') {
          void leadDraftPanelRef.current?.saveDraft();
        } else {
          void handleSaveShortcutRef.current();
        }
      }
      if (event.key === 'Enter' && editTab === 'suggestions') {
        event.preventDefault();
        void suggestionsPanelRef.current?.submitFromShortcut();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editTab, mode, leadDraftPanelRef, suggestionsPanelRef]);
}
