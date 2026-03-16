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
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DraftsCard } from '../components/DraftsCard';
import { DraftsTabContent } from '../components/DraftsTabContent';
import { apiFetch } from '../api/client';
import { ArchiveTabContent } from '../components/ArchiveTabContent';
import { TrashTabContent } from '../components/TrashTabContent';
import { canShowWriteTabs } from '../lib/canShowWriteTabs';
import { formatTableDate } from '../lib/formatDate';
import { useMe } from '../hooks/useMe';
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
import { IconBriefcase, IconFileText, IconRoute, IconUsersGroup } from '@tabler/icons-react';
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

type TeamRes = {
  id: string;
  name: string;
  departmentId?: string;
  department?: { id: string; companyId?: string; company?: { id: string } };
};

type TeamDocItem = {
  id: string;
  title: string;
  contextId: string | null;
  createdAt: string;
  updatedAt: string;
  contextName: string;
};

type EditTarget = { id: string; name: string; type: 'process' | 'project' };
type DeleteTarget = { id: string; type: 'process' | 'project' };

export function TeamContextPage() {
  const { teamId } = useParams<{ teamId: string }>();
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
    data: team,
    isPending: teamPending,
    isError: teamError,
  } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async (): Promise<TeamRes> => {
      if (!teamId) throw new Error('Missing teamId');
      const res = await apiFetch(`/api/v1/teams/${teamId}`);
      if (!res.ok) throw new Error('Failed to load team');
      return (await res.json()) as TeamRes;
    },
    enabled: !!teamId,
  });

  const departmentId = team?.departmentId ?? team?.department?.id;
  const companyId = team?.department?.companyId ?? team?.department?.company?.id;
  const isAdmin = me?.user?.isAdmin === true;
  const isTeamLead =
    (me?.identity?.teams?.length ?? 0) > 0 &&
    me?.identity?.teams?.some((t) => t.teamId === teamId && t.role === 'leader');
  const isDepartmentLead =
    departmentId != null &&
    (me?.identity?.departmentLeads?.length ?? 0) > 0 &&
    me?.identity?.departmentLeads?.some((d) => d.id === departmentId);
  const isCompanyLead =
    companyId != null &&
    (me?.identity?.companyLeads?.length ?? 0) > 0 &&
    me?.identity?.companyLeads?.some((c) => c.id === companyId);
  const canManage = !!(isAdmin || isTeamLead || isDepartmentLead || isCompanyLead);

  const { data: processesData, isPending: processesPending } = useQuery({
    queryKey: ['processes', 'team', teamId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (teamId) params.set('teamId', teamId);
      const res = await apiFetch(`/api/v1/processes?${params}`);
      if (!res.ok) throw new Error('Failed to load processes');
      const data = (await res.json()) as { items: ProcessItem[] };
      return data.items;
    },
    enabled: !!teamId,
  });

  const { data: projectsData, isPending: projectsPending } = useQuery({
    queryKey: ['projects', 'team', teamId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (teamId) params.set('teamId', teamId);
      const res = await apiFetch(`/api/v1/projects?${params}`);
      if (!res.ok) throw new Error('Failed to load projects');
      const data = (await res.json()) as { items: ProjectItem[] };
      return data.items;
    },
    enabled: !!teamId,
  });

  const teamScope = teamId != null ? { type: 'team' as const, id: teamId } : null;

  const [searchParams, setSearchParams] = useSearchParams();
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

  const teamDocumentsParams = [
    teamId ?? '',
    String(docsLimit),
    String(docsOffset),
    docsSortBy,
    docsSortOrder,
    docsSearch,
    docsContextType,
  ];
  const { data: teamDocsRes, isPending: docsPending } = useQuery({
    queryKey: ['catalog-documents', 'team', teamDocumentsParams],
    queryFn: async () => {
      if (!teamId) throw new Error('Missing teamId');
      const params = new URLSearchParams({
        teamId,
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
      return (await res.json()) as { items: TeamDocItem[]; total: number };
    },
    enabled: !!teamId,
  });

  const docsTotal = teamDocsRes?.total ?? 0;
  const docsTotalPages = Math.ceil(docsTotal / docsLimit) || 1;
  const teamDocs = teamDocsRes?.items ?? [];

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

  const navigate = useNavigate();

  const invalidateContexts = () => {
    void queryClient.invalidateQueries({ queryKey: ['processes', 'team', teamId ?? ''] });
    void queryClient.invalidateQueries({ queryKey: ['projects', 'team', teamId ?? ''] });
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

  const overviewPanel = (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ScopeCard
          title="Processes"
          titleCount={processes.length}
          titleIcon={<IconRoute size={18} style={{ flexShrink: 0 }} />}
          viewMore={{ onClick: () => setActiveTab('processes') }}
        >
          {processesPreview.length === 0 ? (
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
          {projectsPreview.length === 0 ? (
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
          {teamDocs.length === 0 ? (
            <Text size="sm" c="dimmed">
              No documents yet.
            </Text>
          ) : (
            <Stack gap={4} align="flex-start">
              {teamDocs.slice(0, 5).map((d) => (
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
        {canWrite && (
          <DraftsCard
            scopeParams={{ teamId: teamId! }}
            limit={5}
            enabled={!!teamId}
            onViewMore={() => setActiveTab('drafts')}
          />
        )}
      </SimpleGrid>
    </Stack>
  );

  const processesPanel = (
    <Stack gap="md">
      {processesPending ? (
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
      {projectsPending ? (
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
            />
          ))}
        </ContextGrid>
      )}
    </Stack>
  );

  const documentsPanel = (
    <Stack gap="md">
      {docsPending ? (
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
              {teamDocs.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text size="sm" c="dimmed">
                      No documents in this team yet. Create a process or project and add documents,
                      or publish drafts from the Drafts tab.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                teamDocs.map((d) => (
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
          {teamId != null && !docsPending && (
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

  if (!teamId) return null;
  if (teamPending || mePending)
    return (
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    );
  if (teamError || !team)
    return (
      <Text size="sm" c="red">
        Team not found.
      </Text>
    );

  return (
    <Box>
      <PageWithTabs
        title={team.name}
        titleIcon={<IconUsersGroup size={28} style={{ flexShrink: 0 }} aria-hidden />}
        description="Contexts and content for the team."
        actions={
          teamId && canManage ? (
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
        recentScope={teamScope}
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
                  <DraftsTabContent scopeParams={{ teamId }} enabled={!!teamId} />
                </Fragment>,
                <Fragment key="trash">
                  <TrashTabContent scope="team" teamId={teamId ?? undefined} />
                </Fragment>,
                <Fragment key="archive">
                  <ArchiveTabContent scope="team" teamId={teamId ?? undefined} />
                </Fragment>,
              ]
            : []),
        ]}
      </PageWithTabs>

      {teamId != null && (
        <>
          <NewContextModal
            opened={contextModalOpened}
            onClose={closeContextModal}
            scope={{ type: 'team', teamId }}
            onSuccess={invalidateContexts}
            initialType={contextInitialType}
          />
          <NewDocumentModal
            opened={documentModalOpened}
            onClose={closeDocumentModal}
            scope={{ type: 'team', teamId }}
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
