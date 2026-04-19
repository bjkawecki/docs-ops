import {
  Box,
  Button,
  Card,
  Group,
  Modal,
  Pagination,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, Fragment, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArchiveTabContent } from '../components/ArchiveTabContent';
import { DraftsCard } from '../components/DraftsCard';
import { DraftsTabContent } from '../components/DraftsTabContent';
import { TrashTabContent } from '../components/TrashTabContent';
import { apiFetch } from '../api/client';
import { useMe } from '../hooks/useMe';
import { canShowWriteTabs } from '../lib/canShowWriteTabs';
import { formatTableDate } from '../lib/formatDate';
import { PageWithTabs } from '../components/PageWithTabs';
import { SortableTableTh } from '../components/SortableTableTh';
import {
  ContextGrid,
  CreateContextMenu,
  EditContextNameModal,
  NewContextModal,
  NewDocumentModal,
  ScopeCard,
} from '../components/contexts';
import {
  IconBriefcase,
  IconBuildingSkyscraper,
  IconFileText,
  IconRoute,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

type ProcessItem = {
  id: string;
  name: string;
  contextId: string;
  documents?: { id: string; title: string }[];
};
type ProjectItem = {
  id: string;
  name: string;
  contextId: string;
  documents?: { id: string; title: string }[];
  subcontexts?: { id: string; name: string }[];
};

type CompanyRes = { id: string; name: string };

type CompanyDocItem = {
  id: string;
  title: string;
  contextId: string | null;
  createdAt: string;
  updatedAt: string;
  contextName: string;
};

type EditTarget = { id: string; name: string; type: 'process' | 'project' };
type DeleteTarget = { id: string; type: 'process' | 'project' };

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

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  const docsSortBy = searchParams.get('docsSortBy') ?? 'updatedAt';
  const docsSortOrder = searchParams.get('docsSortOrder') ?? 'desc';
  const docsPage = Math.max(1, parseInt(searchParams.get('docsPage') ?? '1', 10));
  const docsLimitParam = searchParams.get('docsLimit');
  const docsLimit = docsLimitParam
    ? Math.min(100, Math.max(1, parseInt(docsLimitParam, 10) || 25))
    : 25;
  const docsOffset = (docsPage - 1) * docsLimit;
  const docsSearch = searchParams.get('docsSearch') ?? '';
  const docsContextType = searchParams.get('docsContextType') ?? '';

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
      return (await res.json()) as { items: CompanyDocItem[]; total: number };
    },
    enabled: effectiveCompanyId != null,
  });

  const docsTotal = companyDocsRes?.total ?? 0;
  const docsTotalPages = Math.ceil(docsTotal / docsLimit) || 1;

  const invalidateContexts = () => {
    void queryClient.invalidateQueries({ queryKey: ['processes', effectiveCompanyId ?? ''] });
    void queryClient.invalidateQueries({ queryKey: ['projects', effectiveCompanyId ?? ''] });
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

  const canWrite = effectiveCompanyId != null && canShowWriteTabs(me, canManage);
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
    [setSearchParams, docsSortBy, docsSortOrder]
  );

  const setDocsPage = useCallback(
    (p: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (p <= 1) next.delete('docsPage');
        else next.set('docsPage', String(p));
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
  const companyScope = effectiveCompanyId
    ? { type: 'company' as const, id: effectiveCompanyId }
    : null;

  const processes = processesData ?? [];
  const projects = projectsData ?? [];
  const processesPreview = processes.slice(0, 5);
  const projectsPreview = projects.slice(0, 5);
  const companyDocs = companyDocsRes?.items ?? [];
  const docsPreview = companyDocs.slice(0, 5);

  const overviewPanel = (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ScopeCard
          title="Processes"
          titleCount={processes.length}
          titleIcon={<IconRoute size={18} style={{ flexShrink: 0 }} />}
          viewMore={{ onClick: () => setActiveTab('processes') }}
        >
          {effectiveCompanyId == null ? (
            <Text size="sm" c="dimmed">
              No company selected.
            </Text>
          ) : processesPreview.length === 0 ? (
            <Text size="sm" c="dimmed">
              No processes yet.
            </Text>
          ) : (
            <Stack gap={4} align="flex-start">
              {processesPreview.map((p) => (
                <Link
                  key={p.id}
                  to={`/processes/${p.id}`}
                  style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                >
                  {p.name}
                </Link>
              ))}
            </Stack>
          )}
        </ScopeCard>
        <ScopeCard
          title="Projects"
          titleCount={projects.length}
          titleIcon={<IconBriefcase size={18} style={{ flexShrink: 0 }} />}
          viewMore={{ onClick: () => setActiveTab('projects') }}
        >
          {effectiveCompanyId == null ? (
            <Text size="sm" c="dimmed">
              No company selected.
            </Text>
          ) : projectsPreview.length === 0 ? (
            <Text size="sm" c="dimmed">
              No projects yet.
            </Text>
          ) : (
            <Stack gap={4} align="flex-start">
              {projectsPreview.map((p) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                >
                  {p.name}
                </Link>
              ))}
            </Stack>
          )}
        </ScopeCard>
        <ScopeCard
          title="Documents"
          titleCount={docsTotal}
          titleIcon={<IconFileText size={18} style={{ flexShrink: 0 }} />}
          viewMore={{ onClick: () => setActiveTab('documents') }}
        >
          {effectiveCompanyId == null ? (
            <Text size="sm" c="dimmed">
              No company selected.
            </Text>
          ) : docsPending ? (
            <Text size="sm" c="dimmed">
              Loading documents…
            </Text>
          ) : docsPreview.length === 0 ? (
            <Text size="sm" c="dimmed">
              No documents yet.
            </Text>
          ) : (
            <Stack gap={4} align="flex-start">
              {docsPreview.map((d) => (
                <Link
                  key={d.id}
                  to={`/documents/${d.id}`}
                  style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                >
                  {d.title || d.id}
                </Link>
              ))}
            </Stack>
          )}
        </ScopeCard>
        {effectiveCompanyId != null && (
          <DraftsCard
            scopeParams={{ companyId: effectiveCompanyId }}
            limit={5}
            onViewMore={() => setActiveTab('drafts')}
          />
        )}
      </SimpleGrid>
    </Stack>
  );

  const processesPanel = (
    <Stack gap="md">
      {effectiveCompanyId == null ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No company selected. Contexts are loaded per company.
          </Text>
        </Card>
      ) : processesPending ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Loading processes…
          </Text>
        </Card>
      ) : processes.length === 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No processes yet. Use "Create" to add one.
          </Text>
        </Card>
      ) : (
        <ContextGrid>
          {processes.map((p) => (
            <ScopeCard
              key={p.id}
              title={p.name}
              href={`/processes/${p.id}`}
              documents={p.documents}
            />
          ))}
        </ContextGrid>
      )}
    </Stack>
  );

  const projectsPanel = (
    <Stack gap="md">
      {effectiveCompanyId == null ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No company selected.
          </Text>
        </Card>
      ) : projectsPending ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Loading projects…
          </Text>
        </Card>
      ) : projects.length === 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No projects yet. Use "Create" to add one.
          </Text>
        </Card>
      ) : (
        <ContextGrid>
          {projects.map((p) => (
            <ScopeCard
              key={p.id}
              title={p.name}
              href={`/projects/${p.id}`}
              documents={p.documents}
              subcontexts={p.subcontexts}
              projectId={p.id}
            />
          ))}
        </ContextGrid>
      )}
    </Stack>
  );

  const documentsPanel = (
    <Stack gap="md">
      {effectiveCompanyId == null ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No company selected.
          </Text>
        </Card>
      ) : docsPending ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Loading documents…
          </Text>
        </Card>
      ) : (
        <>
          <Group gap="md" wrap="wrap" align="flex-end">
            <TextInput
              label="Search"
              placeholder="Search by name"
              value={docsSearch}
              onChange={(e) => setDocsFilter('docsSearch', e.currentTarget.value)}
              style={{ minWidth: 200 }}
            />
            <Select
              label="Context type"
              placeholder="All"
              data={[
                { value: '', label: 'All' },
                { value: 'process', label: 'Process' },
                { value: 'project', label: 'Project' },
              ]}
              value={docsContextType || null}
              onChange={(v) => setDocsFilter('docsContextType', v ?? '')}
              clearable
              style={{ minWidth: 140 }}
            />
            <Text size="sm" c="dimmed" style={{ marginLeft: 'auto' }}>
              {docsTotal} document{docsTotal !== 1 ? 's' : ''}
            </Text>
            <Select
              label="Per page"
              data={[
                { value: '10', label: '10' },
                { value: '25', label: '25' },
                { value: '50', label: '50' },
                { value: '100', label: '100' },
              ]}
              value={String(docsLimit)}
              onChange={(v) => v && setDocsLimit(parseInt(v, 10))}
              style={{ width: 90 }}
            />
          </Group>
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <SortableTableTh
                  label="Title"
                  column="title"
                  sortBy={docsSortBy}
                  sortOrder={docsSortOrder}
                  onClick={() => setDocsSort('title')}
                />
                <SortableTableTh
                  label="Context"
                  column="contextName"
                  sortBy={docsSortBy}
                  sortOrder={docsSortOrder}
                  onClick={() => setDocsSort('contextName')}
                />
                <SortableTableTh
                  label="Last updated"
                  column="updatedAt"
                  sortBy={docsSortBy}
                  sortOrder={docsSortOrder}
                  onClick={() => setDocsSort('updatedAt')}
                />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {companyDocs.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text size="sm" c="dimmed">
                      No documents.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                companyDocs.map((d) => (
                  <Table.Tr
                    key={d.id}
                    data-clickable-table-row
                    onClick={() => {
                      void navigate(`/documents/${d.id}`);
                    }}
                  >
                    <Table.Td>
                      <Text fw={500} size="sm">
                        {d.title || d.id}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {d.contextName || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatTableDate(d.updatedAt)}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
          {effectiveCompanyId != null && !docsPending && (
            <Group justify="flex-end">
              <Pagination
                total={docsTotalPages}
                value={docsPage}
                onChange={setDocsPage}
                size="sm"
              />
            </Group>
          )}
        </>
      )}
    </Stack>
  );

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
          <Fragment key="overview">{overviewPanel}</Fragment>,
          <Fragment key="processes">{processesPanel}</Fragment>,
          <Fragment key="projects">{projectsPanel}</Fragment>,
          <Fragment key="documents">{documentsPanel}</Fragment>,
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
        <>
          <NewContextModal
            opened={contextModalOpened}
            onClose={closeContextModal}
            scope={{ type: 'company', companyId: effectiveCompanyId }}
            onSuccess={invalidateContexts}
            initialType={contextInitialType}
          />
          <NewDocumentModal
            opened={documentModalOpened}
            onClose={closeDocumentModal}
            scope={{ type: 'company', companyId: effectiveCompanyId }}
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
