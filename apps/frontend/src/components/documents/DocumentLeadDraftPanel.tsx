import { Alert, Text } from '@mantine/core';
import { forwardRef, useImperativeHandle } from 'react';
import { DocumentLeadDraftPanelView } from './documentLeadDraft/DocumentLeadDraftPanelView.js';
import {
  useDocumentLeadDraftPanelState,
  type DocumentLeadDraftPanelProps,
} from './documentLeadDraft/useDocumentLeadDraftPanelState.js';

export type DocumentLeadDraftPanelHandle = {
  saveDraft: () => Promise<boolean>;
  loadLatestServerDraft: () => void;
};

export const DocumentLeadDraftPanel = forwardRef<
  DocumentLeadDraftPanelHandle,
  DocumentLeadDraftPanelProps
>(function DocumentLeadDraftPanel(props, ref) {
  const s = useDocumentLeadDraftPanelState(props);
  const {
    leadDraftQuery: q,
    data,
    applyIncoming,
    canEdit,
    handleSave,
    remotePending,
    ...viewProps
  } = s;

  useImperativeHandle(
    ref,
    () => ({
      saveDraft: async () => {
        if (!canEdit) return false;
        return handleSave();
      },
      loadLatestServerDraft: () => {
        if (remotePending) applyIncoming(remotePending.revision, remotePending.doc);
      },
    }),
    [applyIncoming, canEdit, handleSave, remotePending]
  );

  if (q.isPending) {
    return (
      <Text size="sm" c="dimmed">
        Loading draft...
      </Text>
    );
  }
  if (q.isError) {
    return (
      <Alert color="red" title="Error">
        Draft could not be loaded.
      </Alert>
    );
  }
  if (data && 'forbidden' in data) {
    return (
      <Text size="sm" c="dimmed">
        No access to the shared draft.
      </Text>
    );
  }

  return (
    <DocumentLeadDraftPanelView
      {...viewProps}
      remotePending={remotePending}
      applyIncoming={applyIncoming}
      handleSave={handleSave}
      canEdit={canEdit}
    />
  );
});

DocumentLeadDraftPanel.displayName = 'DocumentLeadDraftPanel';
