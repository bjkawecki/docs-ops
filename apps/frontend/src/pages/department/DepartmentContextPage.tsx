import { Box, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, Fragment } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  ArchiveTabContent,
  DraftsTabContent,
  TrashTabContent,
} from '../../components/trashArchive';
import { apiFetch } from '../../api/client';
import { canShowWriteTabs } from '../../lib/canShowWriteTabs';
import { useMe } from '../../hooks/useMe';
import { PageWithTabs } from '../../components/ui/PageWithTabs';
import { CreateContextMenu } from '../../components/contexts';
import { IconSitemap } from '@tabler/icons-react';
import type {
  DeleteTarget,
  EditTarget,
  ProcessItem,
  ProjectItem,
  ScopedCatalogDocItem,
} from '../contextScope/contextScopeSharedTypes';
import { DepartmentContextDocumentsTab } from '../departmentContext/DepartmentContextDocumentsTab';
import { DepartmentContextOverviewTab } from '../departmentContext/DepartmentContextOverviewTab';
import { DepartmentContextProcessesTab } from '../departmentContext/DepartmentContextProcessesTab';
import { DepartmentContextProjectsTab } from '../departmentContext/DepartmentContextProjectsTab';
import { useScopedCatalogDocumentsUrlState } from '../contextScope/useScopedCatalogDocumentsUrlState';
import { ContextScopePageModals } from '../contextScope/ContextScopePageModals';
import { useScopedContextPageChrome } from '../contextScope/useScopedContextPageChrome';

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
  const {
    docsSortBy,
    docsSortOrder,
    docsPage,
    docsLimit,
    docsOffset,
    docsSearch,
    docsContextType,
    setDocsFilter,
    setDocsSort,
    setDocsPage,
    setDocsLimit,
  } = useScopedCatalogDocumentsUrlState(searchParams, setSearchParams);

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

  const canWrite = canShowWriteTabs(me, canManage);
  const {
    invalidateContexts,
    handleEditSuccess,
    handleDeleteConfirm,
    tabs,
    activeTab,
    setActiveTab,
  } = useScopedContextPageChrome({
    queryClient,
    searchParams,
    setSearchParams,
    canWrite,
    tabPolicy: 'scoped-with-guard',
    scope: { kind: 'department', departmentId: departmentId ?? '' },
    deleteTarget,
    setEditTarget,
    setDeleteTarget,
    setDeleteLoading,
  });

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
        <ContextScopePageModals
          scope={{ type: 'department', departmentId }}
          contextModalOpened={contextModalOpened}
          closeContextModal={closeContextModal}
          documentModalOpened={documentModalOpened}
          closeDocumentModal={closeDocumentModal}
          contextInitialType={contextInitialType}
          onInvalidateContexts={invalidateContexts}
          editTarget={editTarget}
          onCloseEdit={() => setEditTarget(null)}
          onEditSuccess={handleEditSuccess}
          deleteTarget={deleteTarget}
          onCloseDelete={() => setDeleteTarget(null)}
          deleteLoading={deleteLoading}
          onDeleteConfirm={() => {
            void handleDeleteConfirm();
          }}
        />
      )}
    </Box>
  );
}
