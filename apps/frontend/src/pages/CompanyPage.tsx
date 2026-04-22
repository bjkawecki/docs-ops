import { Box, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArchiveTabContent } from '../components/ArchiveTabContent';
import { DraftsTabContent } from '../components/DraftsTabContent';
import { TrashTabContent } from '../components/TrashTabContent';
import { apiFetch } from '../api/client';
import { useMe } from '../hooks/useMe';
import { canShowWriteTabs } from '../lib/canShowWriteTabs';
import { PageWithTabs } from '../components/PageWithTabs';
import { CreateContextMenu } from '../components/contexts';
import { IconBuildingSkyscraper } from '@tabler/icons-react';
import type {
  DeleteTarget,
  EditTarget,
  ProcessItem,
  ProjectItem,
  ScopedCatalogDocItem,
} from './contextScope/contextScopeSharedTypes';
import { CompanyPageDocumentsTab } from './company/CompanyPageDocumentsTab';
import { CompanyPageOverviewTab } from './company/CompanyPageOverviewTab';
import { CompanyPageProcessesTab } from './company/CompanyPageProcessesTab';
import { CompanyPageProjectsTab } from './company/CompanyPageProjectsTab';
import { useScopedCatalogDocumentsUrlState } from './contextScope/useScopedCatalogDocumentsUrlState';
import { ContextScopePageModals } from './contextScope/ContextScopePageModals';
import { useScopedContextPageChrome } from './contextScope/useScopedContextPageChrome';

type CompanyRes = { id: string; name: string };

export function CompanyPage() {
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
  const companyIdFromLead = me?.identity?.companyLeads?.[0]?.id;
  const isAdmin = me?.user?.isAdmin === true;

  const { data: firstCompany } = useQuery({
    queryKey: ['companies', 'first'],
    queryFn: async (): Promise<CompanyRes | null> => {
      const res = await apiFetch('/api/v1/companies?limit=1');
      if (!res.ok) throw new Error('Failed to load companies');
      const data = (await res.json()) as { items: CompanyRes[] };
      return data.items[0] ?? null;
    },
    enabled: !companyIdFromLead,
  });

  const effectiveCompanyId = companyIdFromLead ?? firstCompany?.id;

  const { data: company } = useQuery({
    queryKey: ['company', effectiveCompanyId ?? ''],
    queryFn: async (): Promise<CompanyRes> => {
      if (!effectiveCompanyId) throw new Error('Missing company id');
      const res = await apiFetch(`/api/v1/companies/${effectiveCompanyId}`);
      if (!res.ok) throw new Error('Failed to load company');
      return (await res.json()) as CompanyRes;
    },
    enabled: effectiveCompanyId != null,
  });

  const canManage = (me?.identity?.companyLeads?.length ?? 0) > 0 || isAdmin;

  const { data: processesData, isPending: processesPending } = useQuery({
    queryKey: ['processes', effectiveCompanyId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (effectiveCompanyId) params.set('companyId', effectiveCompanyId);
      const res = await apiFetch(`/api/v1/processes?${params}`);
      if (!res.ok) throw new Error('Failed to load processes');
      const data = (await res.json()) as { items: ProcessItem[] };
      return data.items;
    },
    enabled: effectiveCompanyId != null,
  });

  const { data: projectsData, isPending: projectsPending } = useQuery({
    queryKey: ['projects', effectiveCompanyId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (effectiveCompanyId) params.set('companyId', effectiveCompanyId);
      const res = await apiFetch(`/api/v1/projects?${params}`);
      if (!res.ok) throw new Error('Failed to load projects');
      const data = (await res.json()) as { items: ProjectItem[] };
      return data.items;
    },
    enabled: effectiveCompanyId != null,
  });

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
  } = useScopedCatalogDocumentsUrlState(searchParams, setSearchParams, {
    docsPageParamMode: 'omitFirstPage',
  });

  const companyDocumentsParams = [
    `companyId=${effectiveCompanyId ?? ''}`,
    `limit=${docsLimit}`,
    `offset=${docsOffset}`,
    `sortBy=${docsSortBy}`,
    `sortOrder=${docsSortOrder}`,
    docsSearch && `search=${encodeURIComponent(docsSearch)}`,
    docsContextType &&
      ['process', 'project'].includes(docsContextType) &&
      `contextType=${docsContextType}`,
  ]
    .filter(Boolean)
    .join('&');
  const { data: companyDocsRes, isPending: docsPending } = useQuery({
    queryKey: ['catalog-documents', companyDocumentsParams],
    queryFn: async () => {
      const params = new URLSearchParams({
        companyId: effectiveCompanyId!,
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
    enabled: effectiveCompanyId != null,
  });

  const docsTotal = companyDocsRes?.total ?? 0;
  const docsTotalPages = Math.ceil(docsTotal / docsLimit) || 1;

  const canWrite = effectiveCompanyId != null && canShowWriteTabs(me, canManage);
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
    scope: { kind: 'company', companyId: effectiveCompanyId ?? '' },
    deleteTarget,
    setEditTarget,
    setDeleteTarget,
    setDeleteLoading,
  });

  const companyScope = effectiveCompanyId
    ? { type: 'company' as const, id: effectiveCompanyId }
    : null;

  const processes = processesData ?? [];
  const projects = projectsData ?? [];
  const processesPreview = processes.slice(0, 5);
  const projectsPreview = projects.slice(0, 5);
  const companyDocs = companyDocsRes?.items ?? [];
  const docsPreview = companyDocs.slice(0, 5);

  if (effectiveCompanyId != null && mePending)
    return (
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    );

  return (
    <Box>
      <PageWithTabs
        title={company?.name ?? 'Company'}
        titleIcon={<IconBuildingSkyscraper size={28} style={{ flexShrink: 0 }} aria-hidden />}
        description="Contexts and content for the company."
        actions={
          effectiveCompanyId && canManage ? (
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
        recentScope={companyScope}
        recentViewMoreHref="/catalog"
      >
        {[
          <Fragment key="overview">
            <CompanyPageOverviewTab
              effectiveCompanyId={effectiveCompanyId}
              processes={processes}
              projects={projects}
              processesPreview={processesPreview}
              projectsPreview={projectsPreview}
              docsTotal={docsTotal}
              docsPending={docsPending}
              docsPreview={docsPreview}
              setActiveTab={setActiveTab}
            />
          </Fragment>,
          <Fragment key="processes">
            <CompanyPageProcessesTab
              effectiveCompanyId={effectiveCompanyId}
              processesPending={processesPending}
              processes={processes}
            />
          </Fragment>,
          <Fragment key="projects">
            <CompanyPageProjectsTab
              effectiveCompanyId={effectiveCompanyId}
              projectsPending={projectsPending}
              projects={projects}
            />
          </Fragment>,
          <Fragment key="documents">
            <CompanyPageDocumentsTab
              effectiveCompanyId={effectiveCompanyId}
              docsPending={docsPending}
              docsSearch={docsSearch}
              setDocsFilter={setDocsFilter}
              docsContextType={docsContextType}
              docsTotal={docsTotal}
              docsLimit={docsLimit}
              setDocsLimit={setDocsLimit}
              companyDocs={companyDocs}
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
                  <DraftsTabContent
                    scopeParams={
                      effectiveCompanyId != null ? { companyId: effectiveCompanyId } : {}
                    }
                    enabled={effectiveCompanyId != null}
                  />
                </Fragment>,
                <Fragment key="trash">
                  <TrashTabContent scope="company" companyId={effectiveCompanyId} />
                </Fragment>,
                <Fragment key="archive">
                  <ArchiveTabContent scope="company" companyId={effectiveCompanyId} />
                </Fragment>,
              ]
            : []),
        ]}
      </PageWithTabs>

      {effectiveCompanyId != null && (
        <ContextScopePageModals
          scope={{ type: 'company', companyId: effectiveCompanyId }}
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
