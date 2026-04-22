import { Box, Card, SimpleGrid, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import { useMe, meQueryKey } from '../../hooks/useMe';
import {
  ArchiveTabContent,
  DraftsCard,
  DraftsTabContent,
  TrashTabContent,
} from '../../components/trashArchive';
import { PageWithTabs } from '../../components/ui/PageWithTabs';
import { ContextGrid, CreateContextMenu, ScopeCard } from '../../components/contexts';
import { IconBriefcase, IconFileText, IconRoute } from '@tabler/icons-react';
import { ContextScopePageModals } from '../contextScope/ContextScopePageModals';
import { useScopedContextPageChrome } from '../contextScope/useScopedContextPageChrome';

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
  const [searchParams, setSearchParams] = useSearchParams();

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
    canWrite: true,
    tabPolicy: 'personal-all',
    scope: { kind: 'personal' },
    deleteTarget,
    setEditTarget,
    setDeleteTarget,
    setDeleteLoading,
    onAfterSuccessfulTrashDelete: () => {
      setSearchParams(
        (prev) => {
          prev.set('tab', 'overview');
          return prev;
        },
        { replace: true }
      );
    },
  });

  const processes = processesData ?? [];
  const projects = projectsData ?? [];
  const personalDocs = personalDocsRes?.items ?? [];
  const processesPreview = processes.slice(0, 5);
  const projectsPreview = projects.slice(0, 5);
  const docsPreview = personalDocs.slice(0, 5);

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
          titleCount={personalDocsRes?.total ?? personalDocs.length}
          titleIcon={<IconFileText size={18} style={{ flexShrink: 0 }} />}
          viewMore={{ onClick: () => setActiveTab('documents') }}
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
        </ScopeCard>
        <DraftsCard
          scopeParams={{ scope: 'personal' }}
          limit={10}
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
              projectId={p.id}
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

      <ContextScopePageModals
        scope={PERSONAL_SCOPE}
        documentModalAllowNoContext
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
    </Box>
  );
}
