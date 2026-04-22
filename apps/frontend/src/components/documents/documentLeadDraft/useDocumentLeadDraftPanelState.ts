import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../../api/client.js';
import type {
  BlockDocumentV0,
  DocumentSuggestionItem,
  LeadDraftResponse,
} from '../../../api/document-types.js';
import type { LeadDraftTiptapEditorHandle } from '../LeadDraftTiptapEditor.js';
import { emptyDoc, POLL_MS } from './leadDraftPanelConstants.js';
import { isDocumentEffectivelyEmpty } from './leadDraftPanelUtils.js';

export type DocumentLeadDraftPanelProps = {
  documentId: string;
  refetchWhenVisible: boolean;
  canPublish: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
  fallbackBlocks?: BlockDocumentV0 | null;
  onDirtyChange?: (dirty: boolean) => void;
  onLastSyncedChange?: (iso: string | null) => void;
};

export function useDocumentLeadDraftPanelState({
  documentId,
  refetchWhenVisible,
  canPublish,
  currentUserId,
  isAdmin = false,
  fallbackBlocks = null,
  onDirtyChange,
  onLastSyncedChange,
}: DocumentLeadDraftPanelProps) {
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

  const state = {
    editorRef,
    leadDraftQuery: q,
    data,
    dirty,
    setDirty,
    rawJsonOpened,
    setRawJsonOpened,
    lastSyncedAt,
    appliedRevision,
    incomingRevision,
    appliedDoc,
    appliedFingerprint,
    remotePending,
    setRemotePending,
    applyIncoming,
    handleSave,
    runSuggestionAction,
    handleResetDraftFromPublished,
    canEdit,
    canPublish,
    currentUserId,
    documentId,
    pendingSuggestions,
    publishedFallbackAvailable,
    draftLooksEmpty,
    isAdmin,
  };
  return state;
}

export type UseDocumentLeadDraftPanelStateResult = ReturnType<
  typeof useDocumentLeadDraftPanelState
>;
export type DocumentLeadDraftPanelViewProps = Omit<
  UseDocumentLeadDraftPanelStateResult,
  'leadDraftQuery' | 'data'
>;
