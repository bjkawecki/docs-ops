import { Alert, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useMemo } from 'react';
import { LeadDraftTiptapEditor } from '../LeadDraftTiptapEditor.js';
import { DraftCollaborationBanner } from './DraftCollaborationBanner.js';
import { DraftSyncMetaBar } from './DraftSyncMetaBar.js';
import type { DocumentLeadDraftPanelViewProps } from './useDocumentLeadDraftPanelState.js';

export type { DocumentLeadDraftPanelViewProps };

export function DocumentLeadDraftPanelView({
  editorRef,
  remotePending,
  setRemotePending,
  applyIncoming,
  appliedRevision,
  incomingRevision,
  canEdit,
  canPublish,
  dirty,
  draftLooksEmpty,
  publishedFallbackAvailable,
  handleResetDraftFromPublished,
  appliedDoc,
  appliedFingerprint,
  setDirty,
  handleSave,
  handleLoadLatest,
  otherEditors,
  rawJsonOpened,
  setRawJsonOpened,
  isAdmin,
  knownServerRevision,
  isRevisionStale,
  editorMode,
  currentUserId,
  currentUserName,
  documentId,
}: DocumentLeadDraftPanelViewProps) {
  const authorNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const editor of otherEditors) {
      map[editor.userId] = editor.name;
    }
    if (currentUserId && currentUserName) {
      map[currentUserId] = currentUserName;
    }
    return map;
  }, [currentUserId, currentUserName, otherEditors]);

  const editorEditable = !!canEdit && (editorMode !== 'author' || !!currentUserId);
  const sessionLoading = !!canEdit && editorMode === 'author' && !currentUserId;

  return (
    <Stack gap="sm">
      <DraftCollaborationBanner
        remotePending={remotePending}
        isRevisionStale={isRevisionStale}
        dirty={dirty}
        knownServerRevision={knownServerRevision}
        appliedRevision={appliedRevision}
        incomingRevision={incomingRevision}
        onLoadLatest={() => void handleLoadLatest()}
        onKeepMine={() => setRemotePending(null)}
      />
      <DraftSyncMetaBar
        appliedRevision={appliedRevision}
        incomingRevision={incomingRevision}
        dirty={dirty}
        isRevisionStale={isRevisionStale}
        knownServerRevision={knownServerRevision}
        canEdit={!!canEdit}
        editorMode={editorMode}
        otherEditors={otherEditors}
      />
      {sessionLoading && (
        <Text size="xs" c="dimmed">
          Loading session…
        </Text>
      )}
      {canEdit && draftLooksEmpty && publishedFallbackAvailable && (
        <Alert color="yellow" title="Draft is currently empty">
          <Stack gap="xs">
            <Text size="sm">
              The shared draft has no visible text, but a published version with content exists.
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="filled"
                onClick={() => void handleResetDraftFromPublished()}
              >
                Reset draft to published
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}

      <LeadDraftTiptapEditor
        ref={editorRef}
        sourceDocument={appliedDoc}
        contentFingerprint={appliedFingerprint}
        baselineFingerprint={appliedFingerprint}
        editable={editorEditable}
        editorMode={editorMode}
        authorId={currentUserId}
        onDirtyChange={setDirty}
        onSaveShortcut={() => {
          void handleSave();
        }}
        suggestionInteractions={{
          documentId,
          draftRevision: appliedRevision ?? incomingRevision,
          persistedDocument: appliedDoc,
          canPublish: !!canPublish,
          currentUserId,
          authorNameById,
          onApplied: (revision, doc) => applyIncoming(revision, doc),
          onLocalChange: () => setDirty(true),
        }}
      />
      {isAdmin && (
        <Group justify="flex-end">
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              setRawJsonOpened(true);
            }}
          >
            View raw JSON
          </Button>
        </Group>
      )}
      <Modal
        opened={rawJsonOpened}
        onClose={() => setRawJsonOpened(false)}
        title="Raw draft JSON"
        centered
        size="xl"
      >
        <Textarea
          readOnly
          minRows={12}
          autosize
          maxRows={28}
          value={JSON.stringify(editorRef.current?.getBlockDocument() ?? appliedDoc, null, 2)}
          styles={{
            input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12 },
          }}
        />
      </Modal>
    </Stack>
  );
}
