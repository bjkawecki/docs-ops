import { SimpleGrid, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { DraftsCard } from '../../components/DraftsCard';
import { ScopeCard } from '../../components/contexts';
import { IconBriefcase, IconFileText, IconRoute } from '@tabler/icons-react';
import type {
  ProcessItem,
  ProjectItem,
  ScopedCatalogDocItem,
} from '../contextScope/contextScopeSharedTypes';

type Props = {
  effectiveCompanyId: string | null | undefined;
  processes: ProcessItem[];
  projects: ProjectItem[];
  processesPreview: ProcessItem[];
  projectsPreview: ProjectItem[];
  docsTotal: number;
  docsPending: boolean;
  docsPreview: ScopedCatalogDocItem[];
  setActiveTab: (tab: string) => void;
};

export function CompanyPageOverviewTab({
  effectiveCompanyId,
  processes,
  projects,
  processesPreview,
  projectsPreview,
  docsTotal,
  docsPending,
  docsPreview,
  setActiveTab,
}: Props) {
  return (
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
            limit={10}
            onViewMore={() => setActiveTab('drafts')}
          />
        )}
      </SimpleGrid>
    </Stack>
  );
}
