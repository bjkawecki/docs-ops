import { Box, Button, Card, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useMe, meQueryKey } from '../hooks/useMe';
import { ArchiveTabContent } from '../components/ArchiveTabContent';
import { DraftsCard } from '../components/DraftsCard';
import { DraftsTabContent } from '../components/DraftsTabContent';
import { PageWithTabs } from '../components/PageWithTabs';
import { TrashTabContent } from '../components/TrashTabContent';
import {
  ContextCard,
  ContextGrid,
  CreateContextMenu,
  EditContextNameModal,
  NewContextModal,
  NewDocumentModal,
  OverviewCard,
} from '../components/contexts';
import { IconBriefcase, IconFileText, IconRoute } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

type ProcessItem = { id: string; name: string; contextId: string };
type ProjectItem = { id: string; name: string; contextId: string };
type DocItem = {
  id: string;
  title: string;
  contextId: string;
  createdAt: string;
  updatedAt: string;
};

const PERSONAL_SCOPE = { type: 'personal' as const };

export function PersonalPage() {
  const queryClient = useQueryClient();
  const [contextModalOpened, { open: openContextModal, close: closeContextModal }] =
    useDisclosure(false);
  const [documentModalOpened, { open: openDocumentModal, close: closeDocumentModal }] =
    useDisclosure(false);
  const [contextInitialType, setContextInitialType] = useState<'process' | 'project' | undefined>(
    undefined
  );
  const [editTarget, setEditTarget] = useState<{
    id: string;
    name: string;
    type: 'process' | 'project';
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    type: 'process' | 'project';
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  useMe();

  const personalScope = PERSONAL_SCOPE;

  const queryParams = 'limit=50&offset=0&ownerUserId=me';

  const { data: processesData, isPending: processesPending } = useQuery({
    queryKey: ['processes', 'personal'],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/processes?${queryParams}`);
      if (!res.ok) throw new Error('Failed to load processes');
      const data = (await res.json()) as { items: ProcessItem[] };
      return data.items;
    },
  });

  const { data: projectsData, isPending: projectsPending } = useQuery({
    queryKey: ['projects', 'personal'],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/projects?${queryParams}`);
      if (!res.ok) throw new Error('Failed to load projects');
      const data = (await res.json()) as { items: ProjectItem[] };
      return data.items;
    },
  });

  const { data: personalDocsRes, isPending: docsPending } = useQuery({
    queryKey: [meQueryKey, 'personal-documents'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/me/personal-documents?limit=50&offset=0');
      if (!res.ok) throw new Error('Failed to load documents');
      return (await res.json()) as { items: DocItem[]; total: number };
    },
  });

  const invalidateContexts = () => {
    void queryClient.invalidateQueries({ queryKey: ['processes', 'personal'] });
    void queryClient.invalidateQueries({ queryKey: ['projects', 'personal'] });
    void queryClient.invalidateQueries({ queryKey: [meQueryKey, 'personal-documents'] });
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
      setActiveTab('overview');
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
        setActiveTab('overview');
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

  const processes = processesData ?? [];
  const projects = projectsData ?? [];
  const personalDocs = personalDocsRes?.items ?? [];
  const processesPreview = processes.slice(0, 5);
  const projectsPreview = projects.slice(0, 5);
  const docsPreview = personalDocs.slice(0, 5);

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'processes', label: 'Processes' },
    { value: 'projects', label: 'Projects' },
    { value: 'documents', label: 'Documents' },
    { value: 'drafts', label: 'Drafts' },
    { value: 'trash', label: 'Trash' },
    { value: 'archive', label: 'Archive' },
  ];
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const setActiveTab = (tab: string) => {
    setSearchParams(
      (prev) => {
        prev.set('tab', tab);
        return prev;
      },
      { replace: true }
    );
  };

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
          {docsPreview.length === 0 ? (
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
        </OverviewCard>
        <DraftsCard
          scopeParams={{ scope: 'personal' }}
          limit={5}
          onViewMore={() => setActiveTab('drafts')}
        />
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
              canManage
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
              canManage
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
      ) : personalDocs.length === 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No documents in your processes or projects yet.
          </Text>
        </Card>
      ) : (
        <Stack gap="xs">
          {personalDocs.map((d) => (
            <Card key={d.id} withBorder padding="sm" component={Link} to={`/documents/${d.id}`}>
              <Text fw={500} size="sm">
                {d.title || d.id}
              </Text>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );

  return (
    <Box>
      <PageWithTabs
        title="Personal"
        description="Your personal processes, projects and documents."
        actions={
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
        }
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        recentScope={personalScope}
        recentViewMoreHref="/catalog"
      >
        {[
          <Fragment key="overview">{overviewPanel}</Fragment>,
          <Fragment key="processes">{processesPanel}</Fragment>,
          <Fragment key="projects">{projectsPanel}</Fragment>,
          <Fragment key="documents">{documentsPanel}</Fragment>,
          <Fragment key="drafts">
            <DraftsTabContent scopeParams={{ scope: 'personal' }} />
          </Fragment>,
          <Fragment key="trash">
            <TrashTabContent scope="personal" />
          </Fragment>,
          <Fragment key="archive">
            <ArchiveTabContent scope="personal" />
          </Fragment>,
        ]}
      </PageWithTabs>

      <NewContextModal
        opened={contextModalOpened}
        onClose={closeContextModal}
        scope={PERSONAL_SCOPE}
        onSuccess={invalidateContexts}
        initialType={contextInitialType}
      />
      <NewDocumentModal
        opened={documentModalOpened}
        onClose={closeDocumentModal}
        scope={PERSONAL_SCOPE}
        onSuccess={invalidateContexts}
        allowNoContext
      />

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
