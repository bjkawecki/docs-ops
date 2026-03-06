import { Box, Button, Card, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useMe, meQueryKey } from '../hooks/useMe';
import { useRecentItems } from '../hooks/useRecentItems';
import { DraftsCard } from '../components/DraftsCard';
import { DraftsTabContent } from '../components/DraftsTabContent';
import { PageWithTabs } from '../components/PageWithTabs';
import {
  ContextCard,
  ContextGrid,
  CreateContextMenu,
  EditContextNameModal,
  NewContextModal,
  NewDocumentModal,
  RecentItemsCard,
} from '../components/contexts';
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
  const { items: recentItems } = useRecentItems(personalScope);

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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const endpoint = deleteTarget.type === 'process' ? '/api/v1/processes' : '/api/v1/projects';
    try {
      const res = await apiFetch(`${endpoint}/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.status === 204) {
        invalidateContexts();
        setDeleteTarget(null);
        notifications.show({
          title: 'Deleted',
          message: 'Context was deleted.',
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
  ];
  const [activeTab, setActiveTab] = useState(tabs[0].value);

  const overviewPanel = (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <RecentItemsCard items={recentItems} />
        <Card withBorder padding="md">
          <Stack gap="xs">
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
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" size="xs" onClick={() => setActiveTab('processes')}>
                View more
              </Button>
            </Group>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Stack gap="xs">
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
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" size="xs" onClick={() => setActiveTab('projects')}>
                View more
              </Button>
            </Group>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Documents
            </Text>
            {docsPreview.length === 0 ? (
              <Text size="sm" c="dimmed">
                No documents yet.
              </Text>
            ) : (
              <Stack gap={4}>
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
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" size="xs" onClick={() => setActiveTab('documents')}>
                View more
              </Button>
            </Group>
          </Stack>
        </Card>
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
      >
        {[
          <Fragment key="overview">{overviewPanel}</Fragment>,
          <Fragment key="processes">{processesPanel}</Fragment>,
          <Fragment key="projects">{projectsPanel}</Fragment>,
          <Fragment key="documents">{documentsPanel}</Fragment>,
          <Fragment key="drafts">
            <DraftsTabContent scopeParams={{ scope: 'personal' }} />
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
        title="Delete context"
        centered
      >
        <Text size="sm" c="dimmed" mb="md">
          This context and related data will be permanently deleted. Continue?
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
            Delete
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
