import { Alert, Badge, Button, Group, Modal, Stack, Text, Textarea, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { LeadDraftTiptapEditor } from '../LeadDraftTiptapEditor.js';
import { affectedBlockIds, blockLabel } from './leadDraftPanelUtils.js';
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
  dirty,
  lastSyncedAt,
  draftLooksEmpty,
  publishedFallbackAvailable,
  handleResetDraftFromPublished,
  appliedDoc,
  appliedFingerprint,
  setDirty,
  handleSave,
  pendingSuggestions,
  runSuggestionAction,
  documentId,
  canPublish,
  currentUserId,
  isAdmin,
  rawJsonOpened,
  setRawJsonOpened,
}: DocumentLeadDraftPanelViewProps) {
  return (
    <Stack gap="sm">
      {remotePending && (
        <Alert color="yellow" title="Remote update available">
          <Stack gap="xs">
            <Text size="sm">
              A newer draft revision is available on the server. Your local unsaved changes are kept
              until you decide.
            </Text>
            <Group gap="xs">
              <Button
                size="compact-sm"
                variant="light"
                onClick={() => applyIncoming(remotePending.revision, remotePending.doc)}
              >
                Load latest
              </Button>
              <Button size="compact-sm" variant="default" onClick={() => setRemotePending(null)}>
                Keep mine
              </Button>
            </Group>
          </Stack>
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
        {dirty && <Badge color="orange">Unsaved changes</Badge>}
        {lastSyncedAt && (
          <Text size="xs" c="dimmed">
            Last synced: {new Date(lastSyncedAt).toLocaleTimeString()}
          </Text>
        )}
      </Group>
      {canEdit && draftLooksEmpty && publishedFallbackAvailable && (
        <Alert color="yellow" variant="light" title="Draft is currently empty">
          <Stack gap="xs">
            <Text size="sm">
              The shared draft has no visible text, but a published version with content exists.
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
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
        onDirtyChange={setDirty}
        onSaveShortcut={() => {
          void handleSave();
        }}
        inlineSuggestionBar={
          pendingSuggestions.length > 0 ? (
            <Group gap="xs" wrap="wrap">
              {pendingSuggestions.map((s) => {
                const blocks = affectedBlockIds(s.ops);
                return (
                  <Group key={s.id} gap={6} wrap="wrap">
                    <Badge variant="light" color="grape">
                      Suggestion by {s.authorName ?? 'Unknown'}
                    </Badge>
                    {blocks.map((id) => (
                      <Badge key={`${s.id}-${id}`} variant="outline" color="gray">
                        {blockLabel(appliedDoc, id)}
                      </Badge>
                    ))}
                    {canPublish && (
                      <>
                        <Button
                          size="compact-xs"
                          color="green"
                          variant="light"
                          onClick={() =>
                            void runSuggestionAction(
                              `/api/v1/documents/${documentId}/suggestions/${s.id}/accept`,
                              'Suggestion accepted.',
                              'Could not accept suggestion.'
                            )
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          size="compact-xs"
                          color="red"
                          variant="light"
                          onClick={() =>
                            void runSuggestionAction(
                              `/api/v1/documents/${documentId}/suggestions/${s.id}/reject`,
                              'Suggestion rejected.',
                              'Could not reject suggestion.'
                            )
                          }
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {!canPublish && currentUserId === s.authorId && (
                      <Button
                        size="compact-xs"
                        variant="light"
                        onClick={() =>
                          void runSuggestionAction(
                            `/api/v1/documents/${documentId}/suggestions/${s.id}/withdraw`,
                            'Suggestion withdrawn.',
                            'Could not withdraw suggestion.'
                          )
                        }
                      >
                        Withdraw
                      </Button>
                    )}
                  </Group>
                );
              })}
            </Group>
          ) : null
        }
      />
      <Group justify="space-between" gap="xs">
        <Group gap="xs">
          {canEdit && (
            <Button size="sm" onClick={() => void handleSave()}>
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
