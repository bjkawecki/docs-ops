import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';
import { useMe } from '../../hooks/useMe';
import { notifyApiErrorResponse } from '../../lib/notifyApiError';
import { scopeToUrl } from '../../lib/scopeNav';
import { useRecentItemsActions } from '../../hooks/useRecentItems';
import type { DocumentLeadDraftPanelHandle } from '../../components/documents/DocumentLeadDraftPanel';
import type { DocumentSuggestionsPanelHandle } from '../../components/documents/DocumentSuggestionsPanel';
import {
  invalidateDocumentArchivedTransitionCaches,
  invalidateDocumentIndexCaches,
  invalidateMeDraftsAndPersonalDocuments,
} from './documentQueryInvalidation';
import { getBlockDocumentHeadingData } from './blockDocumentHeadings';
import { withHeadingNumbering } from './documentMarkdown';
import type { DocumentResponse } from './documentPageTypes';
import { useDocumentPageKeyboardEffects } from './useDocumentPageKeyboardEffects';
import { useDocumentPageSecondaryQueries } from './useDocumentPageSecondaryQueries';

export function useDocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const recentActions = useRecentItemsActions();
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTagIds, setEditTagIds] = useState<string[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [createTagOpened, { open: openCreateTag, close: closeCreateTag }] = useDisclosure(false);
  const [manageTagsOpened, { open: openManageTags, close: closeManageTags }] = useDisclosure(false);
  const [newTagName, setNewTagName] = useState('');
  const [createTagLoading, setCreateTagLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [editInitialSnapshot, setEditInitialSnapshot] = useState<{
    title: string;
    description: string;
    tagIds: string[];
  } | null>(null);
  const [assignContextOpened, { open: openAssignContext, close: closeAssignContext }] =
    useDisclosure(false);
  const [assignContextId, setAssignContextId] = useState<string | null>(null);
  const [assignContextLoading, setAssignContextLoading] = useState(false);
  const [pdfExportLoading, setPdfExportLoading] = useState(false);
  const [pdfExportJobId, setPdfExportJobId] = useState<string | null>(null);
  const [lastPdfExportStatus, setLastPdfExportStatus] = useState<string | null>(null);
  const [isTabVisible, setIsTabVisible] = useState<boolean>(
    () => document.visibilityState === 'visible'
  );
  const [editTab, setEditTab] = useState<'draft' | 'suggestions' | 'metadata' | 'access'>('draft');
  const [leadDraftDirty, setLeadDraftDirty] = useState(false);
  const [leadDraftLastSynced, setLeadDraftLastSynced] = useState<string | null>(null);
  const leadDraftPanelRef = useRef<DocumentLeadDraftPanelHandle>(null);
  const suggestionsPanelRef = useRef<DocumentSuggestionsPanelHandle>(null);

  const { data, isPending, isError } = useQuery({
    queryKey: ['document', documentId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}`);
      if (res.status === 404) throw new Error('not-found');
      if (res.status === 403) throw new Error('forbidden');
      if (!res.ok) throw new Error('Failed to load document');
      return res.json() as Promise<DocumentResponse>;
    },
    enabled: !!documentId,
    refetchInterval: isTabVisible ? 15_000 : false,
  });

  const contextOwnerId = data?.contextOwnerId ?? null;

  const { tags, tagOptions, assignContextOptions, pdfExportStatus } =
    useDocumentPageSecondaryQueries({
      documentId,
      contextOwnerId,
      isTabVisible,
      assignContextOpened,
      pdfExportJobId,
    });

  useEffect(() => {
    if (data) {
      setEditTitle(data.title);
      setEditDescription(data.description ?? '');
      setEditTagIds(data.documentTags.map((dt) => dt.tag.id));
    }
  }, [data]);

  useEffect(() => {
    if (data?.title) {
      document.title = `${data.title} – DocsOps`;
    }
    return () => {
      document.title = 'DocsOps – Internal Documentation';
    };
  }, [data?.title]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsTabVisible(visible);
      if (visible && documentId && pdfExportJobId) {
        void queryClient.invalidateQueries({
          queryKey: ['document-export-pdf-status', documentId, pdfExportJobId],
        });
      }
      if (visible && documentId) {
        void queryClient.invalidateQueries({ queryKey: ['document', documentId, 'lead-draft'] });
        void queryClient.invalidateQueries({ queryKey: ['document', documentId, 'suggestions'] });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [documentId, pdfExportJobId, queryClient]);

  useEffect(() => {
    if (data && recentActions && data.scope) {
      const scope =
        data.scope.type === 'personal'
          ? { type: 'personal' as const }
          : data.scope.type === 'company'
            ? { type: 'company' as const, id: data.scope.id }
            : data.scope.type === 'department'
              ? { type: 'department' as const, id: data.scope.id }
              : { type: 'team' as const, id: data.scope.id };
      recentActions.addRecent({ type: 'document', id: data.id, name: data.title }, scope);
    }
  }, [data, recentActions]);

  useEffect(() => {
    if (!pdfExportStatus || pdfExportStatus.status === lastPdfExportStatus) return;
    setLastPdfExportStatus(pdfExportStatus.status);

    if (pdfExportStatus.status === 'running') {
      notifications.show({
        title: 'PDF export started',
        message: 'Your document export is running in the background.',
        color: 'blue',
      });
      return;
    }
    if (pdfExportStatus.status === 'succeeded') {
      void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      notifications.show({
        title: 'PDF export ready',
        message: 'The PDF export finished successfully.',
        color: 'green',
      });
      return;
    }
    if (pdfExportStatus.status === 'failed') {
      notifications.show({
        title: 'PDF export failed',
        message: pdfExportStatus.error ?? 'Export could not be completed.',
        color: 'red',
      });
      return;
    }
    if (pdfExportStatus.status === 'cancelled') {
      notifications.show({
        title: 'PDF export cancelled',
        message: 'The PDF export was cancelled.',
        color: 'yellow',
      });
    }
  }, [pdfExportStatus, lastPdfExportStatus, queryClient, documentId]);

  const headings = useMemo(
    () => getBlockDocumentHeadingData(data?.publishedBlocks ?? null).headings,
    [data?.publishedBlocks]
  );
  const numberedHeadings = useMemo(() => withHeadingNumbering(headings), [headings]);
  const hasDraftBlocks = (data?.blocks?.blocks?.length ?? 0) > 0;
  const hasPublishedBlocks = (data?.publishedBlocks?.blocks?.length ?? 0) > 0;

  const handleDeleteConfirm = async () => {
    if (!documentId) return;
    setDeleteLoading(true);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}`, { method: 'DELETE' });
      if (res.status === 204) {
        invalidateDocumentIndexCaches(queryClient, documentId, data?.contextId);
        void queryClient.invalidateQueries({ queryKey: ['me', 'trash'] });
        closeDelete();
        notifications.show({
          title: 'Moved to trash',
          message: 'Document can be restored from the Trash tab.',
          color: 'green',
        });
        const scope = data?.scope;
        const target = scope != null ? scopeToUrl(scope) : '/catalog';
        void navigate(target, { replace: true });
      } else {
        void notifyApiErrorResponse(res);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!documentId) return;
    const res = await apiFetch(`/api/v1/documents/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: new Date().toISOString() }),
    });
    if (res.ok) {
      invalidateDocumentArchivedTransitionCaches(queryClient, documentId, data?.contextId);
      notifications.show({
        title: 'Archived',
        message: 'Document was archived.',
        color: 'green',
      });
      const scope = data?.scope;
      const target = scope != null ? scopeToUrl(scope) : '/catalog';
      void navigate(target, { replace: true });
    } else {
      void notifyApiErrorResponse(res);
    }
  };

  const handleUnarchive = async () => {
    if (!documentId) return;
    const res = await apiFetch(`/api/v1/documents/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: null }),
    });
    if (res.ok) {
      invalidateDocumentArchivedTransitionCaches(queryClient, documentId, data?.contextId);
      notifications.show({
        title: 'Unarchived',
        message: 'Document was restored to active.',
        color: 'green',
      });
    } else {
      void notifyApiErrorResponse(res);
    }
  };

  const handleSave = useCallback(async () => {
    if (!documentId || !data) return;
    setSaveLoading(true);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim() || data.title,
          ...(editDescription.trim()
            ? { description: editDescription.trim() }
            : { description: null }),
          tagIds: editTagIds,
        }),
      });
      if (res.ok) {
        invalidateDocumentIndexCaches(queryClient, documentId, data.contextId);
        setMode('view');
        setEditInitialSnapshot(null);
        notifications.show({
          title: 'Saved',
          message: 'Document metadata updated.',
          color: 'green',
        });
      } else {
        void notifyApiErrorResponse(res);
      }
    } finally {
      setSaveLoading(false);
    }
  }, [data, documentId, editDescription, editTagIds, editTitle, queryClient]);

  const handleEditClick = () => {
    if (!data) return;
    setEditTab('draft');
    setLeadDraftDirty(false);
    setEditInitialSnapshot({
      title: data.title,
      description: data.description ?? '',
      tagIds: data.documentTags.map((dt) => dt.tag.id),
    });
    setMode('edit');
  };

  const handleCancelEdit = () => {
    const dirtyMetadata =
      editInitialSnapshot != null &&
      (editTitle !== editInitialSnapshot.title ||
        editDescription !== editInitialSnapshot.description ||
        editTagIds.join(',') !== editInitialSnapshot.tagIds.join(','));
    const dirty = dirtyMetadata || leadDraftDirty;
    if (dirty) {
      const ok = window.confirm('Unsaved progress may be lost. Cancel editing anyway?');
      if (!ok) return;
    }
    setMode('view');
    setEditInitialSnapshot(null);
    setLeadDraftDirty(false);
  };

  const handlePublish = async () => {
    if (!documentId) return;
    setPublishLoading(true);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}/publish`, {
        method: 'POST',
      });
      if (res.ok) {
        invalidateDocumentIndexCaches(queryClient, documentId, data?.contextId);
        invalidateMeDraftsAndPersonalDocuments(queryClient);
        notifications.show({
          title: 'Published',
          message: 'Document was published.',
          color: 'green',
        });
      } else {
        void notifyApiErrorResponse(res);
      }
    } finally {
      setPublishLoading(false);
    }
  };

  const handleAssignContext = async () => {
    if (!documentId || !assignContextId) return;
    setAssignContextLoading(true);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextId: assignContextId }),
      });
      if (res.ok) {
        closeAssignContext();
        if (data?.contextId)
          void queryClient.invalidateQueries({
            queryKey: ['contexts', data.contextId, 'documents'],
          });
        if (assignContextId)
          void queryClient.invalidateQueries({
            queryKey: ['contexts', assignContextId, 'documents'],
          });
        setAssignContextId(null);
        void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
        void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
        notifications.show({
          title: 'Context assigned',
          message: 'You can now publish the draft.',
          color: 'green',
        });
      } else {
        void notifyApiErrorResponse(res);
      }
    } finally {
      setAssignContextLoading(false);
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name || !contextOwnerId) return;
    setCreateTagLoading(true);
    try {
      const res = await apiFetch('/api/v1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ownerId: contextOwnerId }),
      });
      if (res.status === 201) {
        const tag = (await res.json()) as { id: string; name: string };
        void queryClient.invalidateQueries({ queryKey: ['tags', contextOwnerId] });
        setEditTagIds((prev) => [...prev, tag.id]);
        setNewTagName('');
        closeCreateTag();
        notifications.show({
          title: 'Tag created',
          message: tag.name,
          color: 'green',
        });
      } else if (res.status === 409) {
        void notifyApiErrorResponse(res, {
          title: 'Tag exists',
          defaultMessage: 'A tag with this name already exists.',
          color: 'yellow',
        });
      } else {
        void notifyApiErrorResponse(res);
      }
    } finally {
      setCreateTagLoading(false);
    }
  };

  const handleStartPdfExport = async () => {
    if (!documentId) return;
    setPdfExportLoading(true);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}/export-pdf`, { method: 'POST' });
      if (!res.ok) {
        if (res.status === 503) {
          void notifyApiErrorResponse(res, {
            title: 'PDF export currently delayed',
            defaultMessage: 'Queue/worker is currently unavailable. Please try again shortly.',
            color: 'yellow',
          });
          return;
        }
        void notifyApiErrorResponse(res, {
          title: 'PDF export could not be started',
        });
        return;
      }
      const body = (await res.json()) as { jobId: string; status: string };
      setPdfExportJobId(body.jobId);
      setLastPdfExportStatus(null);
      notifications.show({
        title: 'PDF export queued',
        message: 'The export was queued and will run in the background.',
        color: 'blue',
      });
    } finally {
      setPdfExportLoading(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    const res = await apiFetch(`/api/v1/tags/${tagId}`, { method: 'DELETE' });
    if (res.status === 204) {
      if (contextOwnerId)
        void queryClient.invalidateQueries({ queryKey: ['tags', contextOwnerId] });
      setEditTagIds((prev) => prev.filter((id) => id !== tagId));
      notifications.show({ title: 'Tag deleted', message: 'Tag was removed.', color: 'green' });
    }
  };

  useDocumentPageKeyboardEffects({
    mode,
    editTab,
    leadDraftPanelRef,
    suggestionsPanelRef,
    handleSave,
  });

  const metadataDirty =
    editInitialSnapshot != null &&
    (editTitle !== editInitialSnapshot.title ||
      editDescription !== editInitialSnapshot.description ||
      editTagIds.join(',') !== editInitialSnapshot.tagIds.join(','));
  const hasUnsavedChanges = metadataDirty || leadDraftDirty;

  const onCloseAssignContext = () => {
    closeAssignContext();
    setAssignContextId(null);
  };

  return {
    documentId,
    me,
    isPending,
    isError,
    data,
    mode,
    setMode,
    editTitle,
    setEditTitle,
    editDescription,
    setEditDescription,
    editTagIds,
    setEditTagIds,
    saveLoading,
    publishLoading,
    editTab,
    setEditTab,
    leadDraftDirty,
    leadDraftLastSynced,
    setLeadDraftDirty,
    setLeadDraftLastSynced,
    leadDraftPanelRef,
    suggestionsPanelRef,
    headings,
    numberedHeadings,
    hasDraftBlocks,
    hasPublishedBlocks,
    tagOptions,
    tags,
    assignContextOptions,
    pdfExportStatus,
    pdfExportLoading,
    isTabVisible,
    deleteOpened,
    closeDelete,
    openDelete,
    deleteLoading,
    createTagOpened,
    closeCreateTag,
    openCreateTag,
    manageTagsOpened,
    closeManageTags,
    openManageTags,
    newTagName,
    setNewTagName,
    createTagLoading,
    assignContextOpened,
    openAssignContext,
    assignContextId,
    setAssignContextId,
    assignContextLoading,
    onCloseAssignContext,
    handleDeleteConfirm,
    handleArchive,
    handleUnarchive,
    handleSave,
    handleEditClick,
    handleCancelEdit,
    handlePublish,
    handleAssignContext,
    handleCreateTag,
    handleStartPdfExport,
    handleDeleteTag,
    hasUnsavedChanges,
  };
}
