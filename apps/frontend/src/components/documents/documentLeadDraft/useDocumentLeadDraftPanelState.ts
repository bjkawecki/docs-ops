import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../../api/client.js';
import type { BlockDocumentV0 } from '../../../api/document-types.js';
import type { DocumentCollaborationHint } from '../../../hooks/useLiveEvents.js';
import { countPendingSuggestions } from '../../../lib/draftSuggestionUtils.js';
import type { LeadDraftTiptapEditorHandle } from '../LeadDraftTiptapEditor.js';
import { emptyDoc, POLL_MS, PRESENCE_POLL_MS } from './leadDraftPanelConstants.js';
import { isDocumentEffectivelyEmpty } from './leadDraftPanelUtils.js';
import { collaborationHintQueryKey, fetchLeadDraft, leadDraftQueryKey } from './leadDraftQuery.js';

const PRESENCE_HEARTBEAT_MS = 20_000;

export type DraftPresenceEditor = {
  userId: string;
  name: string;
};

export type DocumentLeadDraftPanelProps = {
  documentId: string;
  refetchWhenVisible: boolean;
  canPublish: boolean;
  currentUserId?: string;
  currentUserName?: string;
  isAdmin?: boolean;
  fallbackBlocks?: BlockDocumentV0 | null;
  onDirtyChange?: (dirty: boolean) => void;
  onLastSyncedChange?: (iso: string | null) => void;
  onPendingSuggestionCountChange?: (count: number) => void;
  refetchInterval?: number | false;
};

export function useDocumentLeadDraftPanelState({
  documentId,
  refetchWhenVisible,
  canPublish,
  currentUserId,
  currentUserName,
  isAdmin = false,
  fallbackBlocks = null,
  onDirtyChange,
  onLastSyncedChange,
  onPendingSuggestionCountChange,
  refetchInterval: refetchIntervalProp,
}: DocumentLeadDraftPanelProps) {
  const pollMs = refetchIntervalProp === false ? false : (refetchIntervalProp ?? POLL_MS);
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
    queryKey: leadDraftQueryKey(documentId),
    queryFn: () => fetchLeadDraft(documentId),
    enabled: !!documentId,
    refetchInterval: refetchWhenVisible && !dirty ? pollMs : false,
  });

  const data = q.data;
  const canEdit = data && !('forbidden' in data) && data.canEdit;
  const incomingRevision = data && !('forbidden' in data) ? data.draftRevision : 0;

  const { data: collaborationHint } = useQuery<DocumentCollaborationHint | null>({
    queryKey: collaborationHintQueryKey(documentId),
    queryFn: (): DocumentCollaborationHint | null => null,
    initialData: null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
  const knownServerRevision = Math.max(incomingRevision, collaborationHint?.draftRevision ?? 0);

  const pendingSuggestionCount = useMemo(() => countPendingSuggestions(appliedDoc), [appliedDoc]);

  useEffect(() => {
    onPendingSuggestionCountChange?.(pendingSuggestionCount);
  }, [onPendingSuggestionCountChange, pendingSuggestionCount]);

  const isRevisionStale = appliedRevision != null && knownServerRevision > appliedRevision;

  const presencePollMs = typeof pollMs === 'number' ? pollMs : PRESENCE_POLL_MS;

  const presenceQuery = useQuery({
    queryKey: ['document', documentId, 'draft-presence'],
    queryFn: async (): Promise<DraftPresenceEditor[]> => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/draft/presence`);
      if (res.status === 403) return [];
      if (!res.ok) throw new Error('draft-presence');
      const body = (await res.json()) as { editors: DraftPresenceEditor[] };
      return body.editors;
    },
    enabled: !!documentId && refetchWhenVisible && !!currentUserId,
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: refetchWhenVisible && currentUserId ? presencePollMs : false,
  });

  useEffect(() => {
    if (!documentId || !refetchWhenVisible || !currentUserId) return;

    const sendHeartbeat = () => {
      void apiFetch(`/api/v1/documents/${documentId}/draft/presence`, { method: 'POST' });
    };

    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, PRESENCE_HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      void apiFetch(`/api/v1/documents/${documentId}/draft/presence`, { method: 'DELETE' });
    };
  }, [currentUserId, documentId, refetchWhenVisible]);

  const otherEditors = useMemo((): DraftPresenceEditor[] => {
    const editors = presenceQuery.data ?? [];
    if (!currentUserId) return [];
    return editors.filter((e) => e.userId !== currentUserId);
  }, [currentUserId, presenceQuery.data]);

  const serverDoc = useMemo<BlockDocumentV0>(() => {
    if (!data || 'forbidden' in data) return emptyDoc;
    return data.blocks ?? fallbackBlocks ?? emptyDoc;
  }, [data, fallbackBlocks]);

  const serverFingerprint = useMemo(() => JSON.stringify(serverDoc), [serverDoc]);
  const appliedFingerprint = useMemo(() => JSON.stringify(appliedDoc), [appliedDoc]);

  const applyIncoming = useCallback(
    (revision: number, doc: BlockDocumentV0) => {
      setAppliedRevision(revision);
      setAppliedDoc(doc);
      setDirty(false);
      setRemotePending(null);
      const now = new Date().toISOString();
      setLastSyncedAt(now);
      queryClient.removeQueries({ queryKey: collaborationHintQueryKey(documentId) });
    },
    [documentId, queryClient]
  );

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

  useEffect(() => {
    if (!isRevisionStale) return;
    void (async () => {
      const fresh = await q.refetch();
      const data = fresh.data;
      if (!data || 'forbidden' in data) return;
      if (appliedRevision == null) return;
      if (data.draftRevision <= appliedRevision) return;
      const freshDoc = data.blocks ?? emptyDoc;
      if (dirty) {
        setRemotePending({ revision: data.draftRevision, doc: freshDoc });
      }
    })();
  }, [appliedRevision, collaborationHint?.draftRevision, dirty, isRevisionStale, q]);

  const handleSave = useCallback(async () => {
    if (!data || 'forbidden' in data) return false;
    if (!canPublish && !currentUserId) {
      notifications.show({
        color: 'yellow',
        title: 'Session loading',
        message: 'Please wait until your session is ready before saving suggestions.',
      });
      return false;
    }
    if (!dirty) return true;
    const parsed = editorRef.current?.getBlockDocument() ?? appliedDoc;
    const expectedRevision = appliedRevision ?? incomingRevision;
    if (!Array.isArray(parsed.blocks)) {
      notifications.show({
        color: 'red',
        title: 'Invalid draft',
        message: 'Expected a blocks array.',
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
      const err = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      notifications.show({
        color: 'yellow',
        title: 'Conflict detected',
        message:
          err.code === 'SUGGESTION_DELETE_OVERLAP'
            ? 'Overlapping delete suggestions are not allowed.'
            : 'Draft changed on server while you were editing.',
      });
      await q.refetch();
      return false;
    }
    if (res.status === 400) {
      const err = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      notifications.show({
        color: 'red',
        title: 'Save rejected',
        message:
          err.code === 'AUTHOR_DRAFT_PATCH_INVALID'
            ? 'Authors may only change suggestion-marked content.'
            : typeof err.error === 'string'
              ? err.error
              : 'Invalid draft patch.',
      });
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
      pendingSuggestionCount?: number;
    } | null;
    const nextRevision = body?.draftRevision ?? expectedRevision + 1;
    const nextDoc = body?.blocks ?? parsed;
    applyIncoming(nextRevision, nextDoc);
    notifications.show({ color: 'green', message: 'Draft saved.' });
    await queryClient.invalidateQueries({ queryKey: ['document', documentId] });
    await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'lead-draft'] });
    await queryClient.invalidateQueries({ queryKey: ['me', 'reviews'] });
    await q.refetch();
    return true;
  }, [
    appliedDoc,
    appliedRevision,
    applyIncoming,
    canPublish,
    currentUserId,
    data,
    documentId,
    incomingRevision,
    q,
    queryClient,
    dirty,
  ]);

  const handleLoadLatest = useCallback(async () => {
    if (remotePending) {
      applyIncoming(remotePending.revision, remotePending.doc);
      return;
    }
    const result = await q.refetch();
    const fresh = result.data;
    if (fresh && !('forbidden' in fresh) && fresh.blocks) {
      applyIncoming(fresh.draftRevision, fresh.blocks);
    }
  }, [applyIncoming, q, remotePending]);
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
    handleLoadLatest,
    handleResetDraftFromPublished,
    canEdit,
    canPublish,
    currentUserId,
    currentUserName,
    documentId,
    otherEditors,
    publishedFallbackAvailable,
    draftLooksEmpty,
    isAdmin,
    pendingSuggestionCount,
    knownServerRevision,
    isRevisionStale,
    editorMode: canPublish ? ('lead' as const) : ('author' as const),
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
