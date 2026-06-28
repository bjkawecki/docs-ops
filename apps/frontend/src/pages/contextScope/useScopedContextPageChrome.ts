import type { QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import { meQueryKey } from '../../hooks/useMe';
import type { DeleteTarget, EditTarget } from './contextScopeSharedTypes';

const BASE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'processes', label: 'Processes' },
  { value: 'projects', label: 'Projects' },
  { value: 'documents', label: 'Documents' },
] as const;

const DRAFTS_TAB = { value: 'drafts', label: 'Drafts' } as const;
const TRASH_ARCHIVE_TABS = [
  { value: 'trash', label: 'Trash' },
  { value: 'archive', label: 'Archive' },
] as const;
const WRITE_TABS = [DRAFTS_TAB, ...TRASH_ARCHIVE_TABS] as const;

export type ScopedContextChromeScope =
  | { kind: 'team'; teamId: string }
  | { kind: 'department'; departmentId: string }
  | { kind: 'company'; companyId: string }
  | { kind: 'personal' };

export type ScopedContextTabPolicy = 'personal-all' | 'scoped-with-guard';

export interface UseScopedContextPageChromeArgs {
  queryClient: QueryClient;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  /** Show Drafts tab (authors with write access in scope, not only leads). */
  canShowDrafts: boolean;
  /** Show Trash and Archive tabs (admin or scope lead). */
  canShowTrashArchive: boolean;
  tabPolicy: ScopedContextTabPolicy;
  scope: ScopedContextChromeScope;
  deleteTarget: DeleteTarget | null;
  setEditTarget: (value: EditTarget | null) => void;
  setDeleteTarget: (value: DeleteTarget | null) => void;
  setDeleteLoading: (value: boolean) => void;
  /** Z. B. PersonalPage: nach Löschen auf Overview wechseln */
  onAfterSuccessfulTrashDelete?: () => void;
}

export function useScopedContextPageChrome({
  queryClient,
  searchParams,
  setSearchParams,
  canShowDrafts,
  canShowTrashArchive,
  tabPolicy,
  scope,
  deleteTarget,
  setEditTarget,
  setDeleteTarget,
  setDeleteLoading,
  onAfterSuccessfulTrashDelete,
}: UseScopedContextPageChromeArgs) {
  const invalidateContexts = useCallback(() => {
    switch (scope.kind) {
      case 'team':
        void queryClient.invalidateQueries({ queryKey: ['processes', 'team', scope.teamId] });
        void queryClient.invalidateQueries({ queryKey: ['projects', 'team', scope.teamId] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
        break;
      case 'department':
        void queryClient.invalidateQueries({
          queryKey: ['processes', 'department', scope.departmentId],
        });
        void queryClient.invalidateQueries({
          queryKey: ['projects', 'department', scope.departmentId],
        });
        void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
        break;
      case 'company':
        void queryClient.invalidateQueries({ queryKey: ['processes', scope.companyId] });
        void queryClient.invalidateQueries({ queryKey: ['projects', scope.companyId] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
        break;
      case 'personal':
        void queryClient.invalidateQueries({ queryKey: ['processes', 'personal'] });
        void queryClient.invalidateQueries({ queryKey: ['projects', 'personal'] });
        void queryClient.invalidateQueries({ queryKey: [meQueryKey, 'personal-documents'] });
        break;
    }
  }, [queryClient, scope]);

  const handleEditSuccess = useCallback(() => {
    invalidateContexts();
    setEditTarget(null);
    notifications.show({
      title: 'Saved',
      message: 'Name was updated.',
      color: 'green',
    });
  }, [invalidateContexts, setEditTarget]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const endpoint = deleteTarget.type === 'process' ? '/api/v1/processes' : '/api/v1/projects';
    try {
      const res = await apiFetch(`${endpoint}/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.status === 204) {
        invalidateContexts();
        void queryClient.invalidateQueries({ queryKey: ['me', 'trash'] });
        setDeleteTarget(null);
        onAfterSuccessfulTrashDelete?.();
        notifications.show({
          title: 'Moved to trash',
          message: 'Context can be restored from the Trash tab.',
          color: 'green',
        });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Error',
          message: body?.error ?? res.statusText,
          color: 'red',
        });
      }
    } finally {
      setDeleteLoading(false);
    }
  }, [
    deleteTarget,
    invalidateContexts,
    onAfterSuccessfulTrashDelete,
    queryClient,
    setDeleteLoading,
    setDeleteTarget,
  ]);

  const tabs = useMemo(() => {
    if (tabPolicy === 'personal-all') {
      return [...BASE_TABS, ...WRITE_TABS];
    }
    const extra = [
      ...(canShowDrafts ? [DRAFTS_TAB] : []),
      ...(canShowTrashArchive ? TRASH_ARCHIVE_TABS : []),
    ];
    return [...BASE_TABS, ...extra];
  }, [canShowDrafts, canShowTrashArchive, tabPolicy]);

  const activeTab = searchParams.get('tab') || 'overview';

  const setActiveTab = useCallback(
    (tab: string) => {
      setSearchParams(
        (prev) => {
          prev.set('tab', tab);
          return prev;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (tabPolicy !== 'scoped-with-guard') return;
    const blocked =
      (activeTab === 'drafts' && !canShowDrafts) ||
      ((activeTab === 'trash' || activeTab === 'archive') && !canShowTrashArchive);
    if (blocked) {
      setActiveTab('overview');
    }
  }, [activeTab, canShowDrafts, canShowTrashArchive, setActiveTab, tabPolicy]);

  return {
    invalidateContexts,
    handleEditSuccess,
    handleDeleteConfirm,
    tabs,
    activeTab,
    setActiveTab,
  };
}
