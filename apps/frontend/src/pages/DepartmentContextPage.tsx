import { Box, Button, Card, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, Fragment, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DraftsCard } from '../components/DraftsCard';
import { DraftsTabContent } from '../components/DraftsTabContent';
import { apiFetch } from '../api/client';
import { ArchiveTabContent } from '../components/ArchiveTabContent';
import { TrashTabContent } from '../components/TrashTabContent';
import { canShowWriteTabs } from '../lib/canShowWriteTabs';
import { useMe } from '../hooks/useMe';
import { PageWithTabs } from '../components/PageWithTabs';
import {
  ContextCard,
  ContextGrid,
  CreateContextMenu,
  EditContextNameModal,
  NewContextModal,
  NewDocumentModal,
  OverviewCard,
} from '../components/contexts';
import { IconBriefcase, IconFileText, IconRoute, IconSitemap } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

type ProcessItem = { id: string; name: string; contextId: string };
type ProjectItem = { id: string; name: string; contextId: string };

type DepartmentDocItem = {
  id: string;
  title: string;
  contextId: string | null;
  createdAt: string;
  updatedAt: string;
  contextName: string;
};

type DepartmentRes = { id: string; name: string; companyId?: string; company?: { id: string } };

type EditTarget = { id: string; name: string; type: 'process' | 'project' };
type DeleteTarget = { id: string; type: 'process' | 'project' };

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

  const departmentDocumentsParams =
    departmentId != null
      ? `departmentId=${departmentId}&limit=50&offset=0&sortBy=updatedAt&sortOrder=desc`
      : '';
  const { data: departmentDocsRes, isPending: docsPending } = useQuery({
    queryKey: ['catalog-documents', departmentDocumentsParams],
    queryFn: async () => {
      if (!departmentId) throw new Error('Missing departmentId');
      const res = await apiFetch(
        `/api/v1/documents?departmentId=${departmentId}&limit=50&offset=0&sortBy=updatedAt&sortOrder=desc`
      );
      if (!res.ok) throw new Error('Failed to load documents');
      return (await res.json()) as { items: DepartmentDocItem[]; total: number };
    },
    enabled: !!departmentId,
  });

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

  const handleArchive = async (id: string, type: 'process' | 'project') => {
    const endpoint = type === 'process' ? '/api/v1/processes' : '/api/v1/projects';
    const res = await apiFetch(`${endpoint}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: new Date().toISOString() }),
    });
    if (res.ok) {
      invalidateContexts();
      void queryClient.invalidateQueries({ queryKey: ['me', 'archive'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'trash'] });
      notifications.show({ title: 'Archived', message: 'Context was archived.', color: 'green' });
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      notifications.show({ title: 'Error', message: body?.error ?? res.statusText, color: 'red' });
    }
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

  const [searchParams, setSearchParams] = useSearchParams();
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
  const departmentDocs = departmentDocsRes?.items ?? [];

  const overviewPanel = (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <OverviewCard
          title="Processes"
          titleIcon={<IconRoute size={18} style={{ flexShrink: 0 }} />}
          onViewMore={() => setActiveTab('processes')}
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
        </OverviewCard>
        <OverviewCard
          title="Projects"
          titleIcon={<IconBriefcase size={18} style={{ flexShrink: 0 }} />}
          onViewMore={() => setActiveTab('projects')}
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
        </OverviewCard>
        <OverviewCard
          title="Documents"
          titleIcon={<IconFileText size={18} style={{ flexShrink: 0 }} />}
          onViewMore={() => setActiveTab('documents')}
        >
          {departmentDocs.length === 0 ? (
            <Text size="sm" c="dimmed">
              No documents yet.
            </Text>
          ) : (
            <Stack gap={4} align="flex-start">
              {departmentDocs.slice(0, 5).map((d) => (
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
        </OverviewCard>
        {canWrite && (
          <DraftsCard
            scopeParams={{ departmentId }}
            limit={5}
            enabled={!!departmentId}
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
            <ContextCard
              key={p.id}
              title={p.name}
              type="process"
              href={`/processes/${p.id}`}
              canManage={canManage}
              onEdit={() => setEditTarget({ id: p.id, name: p.name, type: 'process' })}
              onArchive={() => void handleArchive(p.id, 'process')}
              onDelete={() => setDeleteTarget({ id: p.id, type: 'process' })}
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
            <ContextCard
              key={p.id}
              title={p.name}
              type="project"
              href={`/projects/${p.id}`}
              canManage={canManage}
              onEdit={() => setEditTarget({ id: p.id, name: p.name, type: 'project' })}
              onArchive={() => void handleArchive(p.id, 'project')}
              onDelete={() => setDeleteTarget({ id: p.id, type: 'project' })}
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
      ) : departmentDocs.length === 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No documents in this department yet. Create a process or project and add documents, or
            publish drafts from the Drafts tab.
          </Text>
        </Card>
      ) : (
        <Stack gap="xs">
          {departmentDocs.map((d) => (
            <Card key={d.id} withBorder padding="sm" component={Link} to={`/documents/${d.id}`}>
              <Text fw={500} size="sm">
                {d.title || d.id}
              </Text>
              {d.contextName ? (
                <Text size="xs" c="dimmed" mt={4}>
                  {d.contextName}
                </Text>
              ) : null}
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );

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
          <Fragment key="overview">{overviewPanel}</Fragment>,
          <Fragment key="processes">{processesPanel}</Fragment>,
          <Fragment key="projects">{projectsPanel}</Fragment>,
          <Fragment key="documents">{documentsPanel}</Fragment>,
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
