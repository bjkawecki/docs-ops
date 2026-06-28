import { Alert, Badge, Button, Group, Modal, Stack, Text, Textarea, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMemo } from 'react';
import { LeadDraftTiptapEditor } from '../LeadDraftTiptapEditor.js';
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
  lastSyncedAt,
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
  pendingSuggestionCount,
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

  const presenceLabel =
    otherEditors.length === 1
      ? `${otherEditors[0]?.name ?? 'Someone'} is editing`
      : otherEditors.length > 1
        ? `${otherEditors.map((e) => e.name).join(', ')} are editing`
        : null;

  return (
    <Stack gap="sm">
      {(remotePending || (isRevisionStale && dirty)) && (
        <Alert color="yellow" title="Remote update available">
          <Stack gap="xs">
            <Text size="sm">
              {remotePending
                ? `A newer draft revision (${remotePending.revision}) is available on the server. Your local unsaved changes are kept until you decide.`
                : `Draft revision ${knownServerRevision} is available on the server (you have ${appliedRevision ?? incomingRevision}). Reload to see the latest content.`}
            </Text>
            <Group gap="xs">
              <Button
                size="compact-sm"
                variant="filled"
                onClick={() => {
                  void handleLoadLatest();
                }}
              >
                Load latest
              </Button>
              {remotePending && (
                <Button size="compact-sm" variant="default" onClick={() => setRemotePending(null)}>
                  Keep mine
                </Button>
              )}
            </Group>
          </Stack>
        </Alert>
      )}
      {presenceLabel && (
        <Alert color="blue" title="Draft in use">
          <Text size="sm">{presenceLabel}</Text>
        </Alert>
      )}
      <Group gap="md">
        <Group gap={6} align="center">
          <Text size="sm">
            <strong>Draft revision:</strong> {appliedRevision ?? incomingRevision}
          </Text>
          <Tooltip
            multiline
            w={280}
            withArrow
            label="Internal revision number of the shared draft. It increments on every draft update and prevents accidental overwrites when multiple users edit concurrently."
          >
            <IconInfoCircle size={14} color="var(--mantine-color-dimmed)" />
          </Tooltip>
        </Group>
        <Text size="sm" c={canEdit ? 'teal' : 'dimmed'}>
          {canEdit ? 'You can edit this draft.' : 'Read-only access.'}
        </Text>
        {canEdit && !canPublish && (
          <Text size="xs" c="dimmed">
            Only the scope lead can publish.
          </Text>
        )}
        {dirty && <Badge color="orange">Unsaved changes</Badge>}
        {pendingSuggestionCount > 0 && (
          <Badge color="yellow">{pendingSuggestionCount} pending suggestion(s)</Badge>
        )}
        {isRevisionStale && !remotePending && (
          <Badge color="orange" variant="light">
            Server revision {knownServerRevision}
          </Badge>
        )}
        {lastSyncedAt && (
          <Text size="xs" c="dimmed">
            Last synced: {new Date(lastSyncedAt).toLocaleTimeString()}
          </Text>
        )}
      </Group>
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
        editable={!!canEdit}
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
      <Group justify="space-between" gap="xs">
        <Group gap="xs">
          {canEdit && (
            <Button size="sm" disabled={!dirty} onClick={() => void handleSave()}>
              Save draft
            </Button>
          )}
        </Group>
        {isAdmin && (
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              setRawJsonOpened(true);
            }}
          >
            View raw JSON
          </Button>
        )}
      </Group>
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
