import { Box, Button, Group, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, Fragment, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { DraftsTabContent } from '../components/DraftsTabContent';
import { apiFetch } from '../api/client';
import { ArchiveTabContent } from '../components/ArchiveTabContent';
import { TrashTabContent } from '../components/TrashTabContent';
import { canShowWriteTabs } from '../lib/canShowWriteTabs';
import { useMe } from '../hooks/useMe';
import { PageWithTabs } from '../components/PageWithTabs';
import {
  CreateContextMenu,
  EditContextNameModal,
  NewContextModal,
  NewDocumentModal,
} from '../components/contexts';
import { IconSitemap } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type {
  DeleteTarget,
  EditTarget,
  ProcessItem,
  ProjectItem,
  ScopedCatalogDocItem,
} from './contextScope/contextScopeSharedTypes';
import { DepartmentContextDocumentsTab } from './departmentContext/DepartmentContextDocumentsTab';
import { DepartmentContextOverviewTab } from './departmentContext/DepartmentContextOverviewTab';
import { DepartmentContextProcessesTab } from './departmentContext/DepartmentContextProcessesTab';
import { DepartmentContextProjectsTab } from './departmentContext/DepartmentContextProjectsTab';

type DepartmentRes = { id: string; name: string; companyId?: string; company?: { id: string } };

export function DepartmentContextPage() {
  const { departmentId } = useParams<{ departmentId: string }>();
  const queryClient = useQueryClient();
  const [contextModalOpened, { open: openContextModal, close: closeContextModal }] =
    useDisclosure(false);
  const [documentModalOpened, { open: openDocumentModal, close: closeDocumentModal }] =
    useDisclosure(false);
  const [contextInitialType, setContextInitialType] = useState<'process' | 'project' | undefined>(
    undefined
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { data: me, isPending: mePending } = useMe();

  const {
    data: department,
    isPending: departmentPending,
    isError: departmentError,
  } = useQuery({
    queryKey: ['department', departmentId],
    queryFn: async (): Promise<DepartmentRes> => {
      if (!departmentId) throw new Error('Missing departmentId');
      const res = await apiFetch(`/api/v1/departments/${departmentId}`);
      if (!res.ok) throw new Error('Failed to load department');
      return (await res.json()) as DepartmentRes;
    },
    enabled: !!departmentId,
  });

  const companyId = department?.companyId ?? department?.company?.id;
  const isAdmin = me?.user?.isAdmin === true;
  const isDepartmentLead =
    (me?.identity?.departmentLeads?.length ?? 0) > 0 &&
    me?.identity?.departmentLeads?.some((d) => d.id === departmentId);
  const isCompanyLead =
    companyId != null &&
    (me?.identity?.companyLeads?.length ?? 0) > 0 &&
    me?.identity?.companyLeads?.some((c) => c.id === companyId);
  const canManage = !!(isAdmin || isDepartmentLead || isCompanyLead);

  const { data: processesData, isPending: processesPending } = useQuery({
    queryKey: ['processes', 'department', departmentId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (departmentId) params.set('departmentId', departmentId);
      const res = await apiFetch(`/api/v1/processes?${params}`);
      if (!res.ok) throw new Error('Failed to load processes');
      const data = (await res.json()) as { items: ProcessItem[] };
      return data.items;
    },
    enabled: !!departmentId,
  });

  const { data: projectsData, isPending: projectsPending } = useQuery({
    queryKey: ['projects', 'department', departmentId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (departmentId) params.set('departmentId', departmentId);
      const res = await apiFetch(`/api/v1/projects?${params}`);
      if (!res.ok) throw new Error('Failed to load projects');
      const data = (await res.json()) as { items: ProjectItem[] };
      return data.items;
    },
    enabled: !!departmentId,
  });

  const departmentScope =
    departmentId != null ? { type: 'department' as const, id: departmentId } : null;

  const [searchParams, setSearchParams] = useSearchParams();
  const docsSortBy = searchParams.get('docsSortBy') ?? 'updatedAt';
  const docsSortOrder = searchParams.get('docsSortOrder') ?? 'desc';
  const docsPage = Math.max(1, parseInt(searchParams.get('docsPage') ?? '1', 10));
  const docsLimitParam = searchParams.get('docsLimit');
  const docsLimit = docsLimitParam
    ? Math.min(100, Math.max(1, parseInt(docsLimitParam, 10) || 10))
    : 10;
  const docsOffset = (docsPage - 1) * docsLimit;
  const docsSearch = searchParams.get('docsSearch') ?? '';
  const docsContextType = searchParams.get('docsContextType') ?? '';

  const departmentDocumentsParams = [
    departmentId ?? '',
    String(docsLimit),
    String(docsOffset),
    docsSortBy,
    docsSortOrder,
    docsSearch,
    docsContextType,
  ];
  const { data: departmentDocsRes, isPending: docsPending } = useQuery({
    queryKey: ['catalog-documents', 'department', departmentDocumentsParams],
    queryFn: async () => {
      if (!departmentId) throw new Error('Missing departmentId');
      const params = new URLSearchParams({
        departmentId,
        limit: String(docsLimit),
        offset: String(docsOffset),
        sortBy: docsSortBy,
        sortOrder: docsSortOrder,
      });
      if (docsSearch.trim()) params.set('search', docsSearch.trim());
      if (docsContextType === 'process' || docsContextType === 'project')
        params.set('contextType', docsContextType);
      const res = await apiFetch(`/api/v1/documents?${params}`);
      if (!res.ok) throw new Error('Failed to load documents');
      return (await res.json()) as { items: ScopedCatalogDocItem[]; total: number };
    },
    enabled: !!departmentId,
  });

  const docsTotal = departmentDocsRes?.total ?? 0;
  const docsTotalPages = Math.ceil(docsTotal / docsLimit) || 1;
  const departmentDocs = departmentDocsRes?.items ?? [];

  const setDocsFilter = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
        next.delete('docsPage');
        return next;
      });
    },
    [setSearchParams]
  );

  const setDocsSort = useCallback(
    (col: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const order = docsSortBy === col && docsSortOrder === 'desc' ? 'asc' : 'desc';
        next.set('docsSortBy', col);
        next.set('docsSortOrder', order);
        next.delete('docsPage');
        return next;
      });
    },
    [docsSortBy, docsSortOrder, setSearchParams]
  );

  const setDocsPage = useCallback(
    (p: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('docsPage', String(p));
        return next;
      });
    },
    [setSearchParams]
  );

  const setDocsLimit = useCallback(
    (value: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('docsLimit', String(value));
        next.delete('docsPage');
        return next;
      });
    },
    [setSearchParams]
  );

  const invalidateContexts = () => {
    void queryClient.invalidateQueries({
      queryKey: ['processes', 'department', departmentId ?? ''],
    });
    void queryClient.invalidateQueries({
      queryKey: ['projects', 'department', departmentId ?? ''],
    });
    void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
  };

  const handleEditSuccess = () => {
    invalidateContexts();
    setEditTarget(null);
    notifications.show({
      title: 'Saved',
      message: 'Name was updated.',
      color: 'green',
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const endpoint = deleteTarget.type === 'process' ? '/api/v1/processes' : '/api/v1/projects';
    try {
      const res = await apiFetch(`${endpoint}/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.status === 204) {
        invalidateContexts();
        void queryClient.invalidateQueries({ queryKey: ['me', 'trash'] });
        setDeleteTarget(null);
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
  };

  const canWrite = canShowWriteTabs(me, canManage);
  const baseTabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'processes', label: 'Processes' },
    { value: 'projects', label: 'Projects' },
    { value: 'documents', label: 'Documents' },
  ];
  const writeTabs = [
    { value: 'drafts', label: 'Drafts' },
    { value: 'trash', label: 'Trash' },
    { value: 'archive', label: 'Archive' },
  ];
  const tabs = [...baseTabs, ...(canWrite ? writeTabs : [])];

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
    if (!canWrite && ['drafts', 'trash', 'archive'].includes(activeTab)) {
      setActiveTab('overview');
    }
  }, [canWrite, activeTab, setActiveTab]);
  const processes = processesData ?? [];
  const projects = projectsData ?? [];
  const processesPreview = processes.slice(0, 5);
  const projectsPreview = projects.slice(0, 5);

  if (!departmentId) return null;
  if (departmentPending || mePending)
    return (
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    );
  if (departmentError || !department)
    return (
      <Text size="sm" c="red">
        Department not found.
      </Text>
    );

  return (
    <Box>
      <PageWithTabs
        title={department.name}
        titleIcon={<IconSitemap size={28} style={{ flexShrink: 0 }} aria-hidden />}
        description="Contexts and content for the department."
        actions={
          departmentId && canManage ? (
            <CreateContextMenu
              onCreateProcess={() => {
                setContextInitialType('process');
                openContextModal();
              }}
              onCreateProject={() => {
                setContextInitialType('project');
                openContextModal();
              }}
              onCreateDraft={openDocumentModal}
            />
          ) : null
        }
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        recentScope={departmentScope}
        recentViewMoreHref="/catalog"
      >
        {[
          <Fragment key="overview">
            <DepartmentContextOverviewTab
              processes={processes}
              projects={projects}
              processesPreview={processesPreview}
              projectsPreview={projectsPreview}
              docsTotal={docsTotal}
              departmentDocs={departmentDocs}
              canWrite={canWrite}
              departmentId={departmentId}
              setActiveTab={setActiveTab}
            />
          </Fragment>,
          <Fragment key="processes">
            <DepartmentContextProcessesTab
              processesPending={processesPending}
              processes={processes}
            />
          </Fragment>,
          <Fragment key="projects">
            <DepartmentContextProjectsTab projectsPending={projectsPending} projects={projects} />
          </Fragment>,
          <Fragment key="documents">
            <DepartmentContextDocumentsTab
              departmentId={departmentId}
              docsPending={docsPending}
              docsSearch={docsSearch}
              setDocsFilter={setDocsFilter}
              docsContextType={docsContextType}
              docsTotal={docsTotal}
              docsLimit={docsLimit}
              setDocsLimit={setDocsLimit}
              departmentDocs={departmentDocs}
              docsSortBy={docsSortBy}
              docsSortOrder={docsSortOrder}
              setDocsSort={setDocsSort}
              docsPage={docsPage}
              docsTotalPages={docsTotalPages}
              setDocsPage={setDocsPage}
            />
          </Fragment>,
          ...(canWrite
            ? [
                <Fragment key="drafts">
                  <DraftsTabContent scopeParams={{ departmentId }} enabled={!!departmentId} />
                </Fragment>,
                <Fragment key="trash">
                  <TrashTabContent scope="department" departmentId={departmentId ?? undefined} />
                </Fragment>,
                <Fragment key="archive">
                  <ArchiveTabContent scope="department" departmentId={departmentId ?? undefined} />
                </Fragment>,
              ]
            : []),
        ]}
      </PageWithTabs>

      {departmentId != null && (
        <>
          <NewContextModal
            opened={contextModalOpened}
            onClose={closeContextModal}
            scope={{ type: 'department', departmentId }}
            onSuccess={invalidateContexts}
            initialType={contextInitialType}
          />
          <NewDocumentModal
            opened={documentModalOpened}
            onClose={closeDocumentModal}
            scope={{ type: 'department', departmentId }}
            onSuccess={invalidateContexts}
          />
        </>
      )}

      {editTarget != null && (
        <EditContextNameModal
          opened
          onClose={() => setEditTarget(null)}
          type={editTarget.type}
          contextId={editTarget.id}
          currentName={editTarget.name}
          onSuccess={handleEditSuccess}
        />
      )}

      <Modal
        opened={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="Move to trash"
        centered
      >
        <Text size="sm" c="dimmed" mb="md">
          This context and its documents will be moved to trash. You can restore them from the Trash
          tab.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={deleteLoading}
            onClick={() => {
              void handleDeleteConfirm();
            }}
          >
            Move to trash
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
