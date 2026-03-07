import { Box, Button, Card, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
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
} from '../components/contexts';
import { notifications } from '@mantine/notifications';

type ProcessItem = { id: string; name: string; contextId: string };
type ProjectItem = { id: string; name: string; contextId: string };

type TeamRes = {
  id: string;
  name: string;
  departmentId?: string;
  department?: { id: string; companyId?: string; company?: { id: string } };
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

  const invalidateContexts = () => {
    void queryClient.invalidateQueries({ queryKey: ['processes', 'team', teamId ?? ''] });
    void queryClient.invalidateQueries({ queryKey: ['projects', 'team', teamId ?? ''] });
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

  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!canWrite && ['drafts', 'trash', 'archive'].includes(activeTab)) {
      setActiveTab('overview');
    }
  }, [canWrite, activeTab]);

  const processes = processesData ?? [];
  const projects = projectsData ?? [];
  const processesPreview = processes.slice(0, 5);
  const projectsPreview = projects.slice(0, 5);

  const overviewPanel = (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder padding="md" h="100%">
          <Stack gap="xs" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
            <Box style={{ flex: 1, minHeight: 0 }}>
              <Text fw={600} size="sm">
                Processes
              </Text>
              {processesPreview.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No processes yet.
                </Text>
              ) : (
                <Stack gap={4}>
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
            </Box>
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" size="xs" onClick={() => setActiveTab('processes')}>
                View more
              </Button>
            </Group>
          </Stack>
        </Card>
        <Card withBorder padding="md" h="100%">
          <Stack gap="xs" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
            <Box style={{ flex: 1, minHeight: 0 }}>
              <Text fw={600} size="sm">
                Projects
              </Text>
              {projectsPreview.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No projects yet.
                </Text>
              ) : (
                <Stack gap={4}>
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
            </Box>
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" size="xs" onClick={() => setActiveTab('projects')}>
                View more
              </Button>
            </Group>
          </Stack>
        </Card>
        <Card withBorder padding="md" h="100%">
          <Stack gap="xs" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
            <Box style={{ flex: 1, minHeight: 0 }}>
              <Text fw={600} size="sm">
                Documents
              </Text>
              <Text size="sm" c="dimmed">
                Documents – content to follow.
              </Text>
            </Box>
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" size="xs" onClick={() => setActiveTab('documents')}>
                View more
              </Button>
            </Group>
          </Stack>
        </Card>
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
    <Card withBorder padding="md">
      <Text size="sm" c="dimmed">
        Documents – content to follow.
      </Text>
    </Card>
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
