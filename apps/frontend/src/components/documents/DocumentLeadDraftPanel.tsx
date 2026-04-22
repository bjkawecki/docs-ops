import { Alert, Badge, Button, Group, Modal, Stack, Text, Textarea, Tooltip } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';
import type {
  BlockDocumentV0,
  DocumentSuggestionItem,
  LeadDraftResponse,
} from '../../api/document-types';
import { IconInfoCircle } from '@tabler/icons-react';
import { innerTextFromBlockNode } from '../../lib/blockDocumentTiptap';
import { LeadDraftTiptapEditor, type LeadDraftTiptapEditorHandle } from './LeadDraftTiptapEditor';

const POLL_MS = 15_000;

const emptyDoc: BlockDocumentV0 = {
  schemaVersion: 0,
  blocks: [
    {
      id: 'initial-paragraph',
      type: 'paragraph',
      content: [{ id: 'initial-text', type: 'text', attrs: {}, meta: { text: '' } }],
    },
  ],
};

type Props = {
  documentId: string;
  refetchWhenVisible: boolean;
  canPublish: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
  fallbackBlocks?: BlockDocumentV0 | null;
  onDirtyChange?: (dirty: boolean) => void;
  onLastSyncedChange?: (iso: string | null) => void;
};

export type DocumentLeadDraftPanelHandle = {
  saveDraft: () => Promise<boolean>;
  loadLatestServerDraft: () => void;
};

function affectedBlockIds(ops: unknown): string[] {
  if (!Array.isArray(ops)) return [];
  const ids: string[] = [];
  for (const op of ops) {
    if (op == null || typeof op !== 'object') continue;
    const r = op as Record<string, unknown>;
    if (r.op === 'deleteBlock' || r.op === 'replaceBlock') {
      if (typeof r.blockId === 'string') ids.push(r.blockId);
    }
    if (r.op === 'insertAfter' && typeof r.afterBlockId === 'string') ids.push(r.afterBlockId);
  }
  return [...new Set(ids)];
}

function blockLabel(doc: BlockDocumentV0, blockId: string): string {
  const b = doc.blocks.find((x) => x.id === blockId);
  if (!b) return blockId;
  const text = innerTextFromBlockNode(b).trim();
  return text.length > 0 ? text.slice(0, 64) : `${b.type} (${blockId.slice(0, 6)})`;
}

function nodeHasVisibleText(node: unknown): boolean {
  if (node == null || typeof node !== 'object') return false;
  const rec = node as Record<string, unknown>;
  const meta = rec.meta;
  if (meta != null && typeof meta === 'object') {
    const text = (meta as Record<string, unknown>).text;
    if (typeof text === 'string' && text.trim().length > 0) return true;
  }
  const content = rec.content;
  if (Array.isArray(content)) {
    return content.some((child) => nodeHasVisibleText(child));
  }
  return false;
}

function isDocumentEffectivelyEmpty(doc: BlockDocumentV0 | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.blocks) || doc.blocks.length === 0) return true;
  return !doc.blocks.some((block) => nodeHasVisibleText(block));
}

export const DocumentLeadDraftPanel = forwardRef<DocumentLeadDraftPanelHandle, Props>(
  function DocumentLeadDraftPanel(
    {
      documentId,
      refetchWhenVisible,
      canPublish,
      currentUserId,
      isAdmin = false,
      fallbackBlocks = null,
      onDirtyChange,
      onLastSyncedChange,
    },
    ref
  ) {
    const queryClient = useQueryClient();
    const editorRef = useRef<LeadDraftTiptapEditorHandle>(null);
    const [dirty, setDirty] = useState(false);
    const [rawJsonOpened, setRawJsonOpened] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
    const [appliedRevision, setAppliedRevision] = useState<number | null>(null);
    const [appliedDoc, setAppliedDoc] = useState<BlockDocumentV0>(fallbackBlocks ?? emptyDoc);
    const [remotePending, setRemotePending] = useState<{
      revision: number;
      doc: BlockDocumentV0;
    } | null>(null);

    useEffect(() => {
      onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    useEffect(() => {
      onLastSyncedChange?.(lastSyncedAt);
    }, [lastSyncedAt, onLastSyncedChange]);

    const q = useQuery({
      queryKey: ['document', documentId, 'lead-draft'],
      queryFn: async () => {
        const res = await apiFetch(`/api/v1/documents/${documentId}/lead-draft`);
        if (res.status === 403) return { forbidden: true as const };
        if (res.status === 404) throw new Error('not-found');
        if (!res.ok) throw new Error('lead-draft');
        return res.json() as Promise<LeadDraftResponse>;
      },
      enabled: !!documentId,
      refetchInterval: refetchWhenVisible && !dirty ? POLL_MS : false,
    });

    const suggestionsQuery = useQuery({
      queryKey: ['document', documentId, 'suggestions'],
      queryFn: async () => {
        const res = await apiFetch(`/api/v1/documents/${documentId}/suggestions`);
        if (res.status === 403) return [] as DocumentSuggestionItem[];
        if (!res.ok) throw new Error('suggestions');
        return res.json() as Promise<DocumentSuggestionItem[]>;
      },
      enabled: !!documentId,
      refetchInterval: refetchWhenVisible ? POLL_MS : false,
    });

    const data = q.data;
    const canEdit = data && !('forbidden' in data) && data.canEdit;
    const incomingRevision = data && !('forbidden' in data) ? data.draftRevision : 0;

    const serverDoc = useMemo<BlockDocumentV0>(() => {
      if (!data || 'forbidden' in data) return emptyDoc;
      return data.blocks ?? fallbackBlocks ?? emptyDoc;
    }, [data, fallbackBlocks]);

    const serverFingerprint = useMemo(() => JSON.stringify(serverDoc), [serverDoc]);
    const appliedFingerprint = useMemo(() => JSON.stringify(appliedDoc), [appliedDoc]);

    const applyIncoming = useCallback((revision: number, doc: BlockDocumentV0) => {
      setAppliedRevision(revision);
      setAppliedDoc(doc);
      setDirty(false);
      setRemotePending(null);
      const now = new Date().toISOString();
      setLastSyncedAt(now);
    }, []);

    useEffect(() => {
      if (!data || 'forbidden' in data) return;
      if (appliedRevision == null) {
        applyIncoming(incomingRevision, serverDoc);
        return;
      }
      const changed =
        incomingRevision !== appliedRevision || serverFingerprint !== appliedFingerprint;
      if (!changed) return;
      if (dirty) {
        setRemotePending({ revision: incomingRevision, doc: serverDoc });
        return;
      }
      applyIncoming(incomingRevision, serverDoc);
    }, [
      appliedFingerprint,
      appliedRevision,
      applyIncoming,
      data,
      dirty,
      incomingRevision,
      serverDoc,
      serverFingerprint,
    ]);

    const handleSave = useCallback(async () => {
      if (!data || 'forbidden' in data) return false;
      const parsed = editorRef.current?.getBlockDocument() ?? appliedDoc;
      const expectedRevision = appliedRevision ?? incomingRevision;
      if (parsed.schemaVersion !== 0 || !Array.isArray(parsed.blocks)) {
        notifications.show({
          color: 'red',
          title: 'Invalid draft',
          message: 'Expected schemaVersion: 0 and blocks array.',
        });
        return false;
      }
      const res = await apiFetch(`/api/v1/documents/${documentId}/lead-draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision,
          blocks: parsed,
        }),
      });
      if (res.status === 409) {
        notifications.show({
          color: 'yellow',
          title: 'Conflict detected',
          message: 'Draft changed on server while you were editing.',
        });
        await q.refetch();
        return false;
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown };
        const msg = typeof err.error === 'string' ? err.error : res.statusText;
        notifications.show({
          color: 'red',
          title: 'Save failed',
          message: msg,
        });
        return false;
      }
      const body = (await res.json().catch(() => null)) as {
        draftRevision: number;
        blocks: BlockDocumentV0;
      } | null;
      const nextRevision = body?.draftRevision ?? expectedRevision + 1;
      const nextDoc = body?.blocks ?? parsed;
      applyIncoming(nextRevision, nextDoc);
      notifications.show({ color: 'green', message: 'Draft saved.' });
      await queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'lead-draft'] });
      await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'suggestions'] });
      await q.refetch();
      return true;
    }, [
      appliedDoc,
      appliedRevision,
      applyIncoming,
      data,
      documentId,
      incomingRevision,
      q,
      queryClient,
    ]);

    const runSuggestionAction = useCallback(
      async (url: string, successMessage: string, failMessage: string) => {
        const res = await apiFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) {
          notifications.show({ color: 'red', message: failMessage });
          return;
        }
        notifications.show({ color: 'green', message: successMessage });
        await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'suggestions'] });
        await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'lead-draft'] });
        await suggestionsQuery.refetch();
        await q.refetch();
      },
      [documentId, q, queryClient, suggestionsQuery]
    );

    const pendingSuggestions = useMemo(
      () =>
        (suggestionsQuery.data ?? []).filter(
          (s) => s.status === 'pending' && (canPublish || s.authorId === currentUserId)
        ),
      [canPublish, currentUserId, suggestionsQuery.data]
    );
    const publishedFallbackAvailable = !isDocumentEffectivelyEmpty(fallbackBlocks);
    const draftLooksEmpty = isDocumentEffectivelyEmpty(appliedDoc);

    const handleResetDraftFromPublished = useCallback(async () => {
      if (!canEdit || !fallbackBlocks || isDocumentEffectivelyEmpty(fallbackBlocks)) return;
      const expectedRevision = appliedRevision ?? incomingRevision;
      const res = await apiFetch(`/api/v1/documents/${documentId}/lead-draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision,
          blocks: fallbackBlocks,
        }),
      });
      if (!res.ok) {
        notifications.show({
          color: 'red',
          title: 'Reset failed',
          message: 'Could not reset draft from the published version.',
        });
        await q.refetch();
        return;
      }
      notifications.show({
        color: 'green',
        message: 'Draft reset to published content.',
      });
      await queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'lead-draft'] });
      await q.refetch();
    }, [appliedRevision, canEdit, documentId, fallbackBlocks, incomingRevision, q, queryClient]);

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
      <Stack gap="sm">
        {remotePending && (
          <Alert color="yellow" title="Remote update available">
            <Stack gap="xs">
              <Text size="sm">
                A newer draft revision is available on the server. Your local unsaved changes are
                kept until you decide.
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
);

DocumentLeadDraftPanel.displayName = 'DocumentLeadDraftPanel';
