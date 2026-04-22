import { SimpleGrid, Stack, Text } from '@mantine/core';
import { IconBriefcase, IconFileText, IconRoute } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { DraftsCard } from '../../components/DraftsCard';
import { ScopeCard } from '../../components/contexts';
import type { ProcessItem, ProjectItem, TeamDocItem } from './teamContextPageTypes';

export type TeamOverviewPanelProps = {
  processesPreview: ProcessItem[];
  projectsPreview: ProjectItem[];
  processesCount: number;
  projectsCount: number;
  docsTotal: number;
  teamDocs: TeamDocItem[];
  canWrite: boolean;
  teamId: string;
  onGoToTab: (tab: string) => void;
};

export function TeamOverviewPanel({
  processesPreview,
  projectsPreview,
  processesCount,
  projectsCount,
  docsTotal,
  teamDocs,
  canWrite,
  teamId,
  onGoToTab,
}: TeamOverviewPanelProps) {
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ScopeCard
          title="Processes"
          titleCount={processesCount}
          titleIcon={<IconRoute size={18} style={{ flexShrink: 0 }} />}
          viewMore={{ onClick: () => onGoToTab('processes') }}
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
          titleCount={projectsCount}
          titleIcon={<IconBriefcase size={18} style={{ flexShrink: 0 }} />}
          viewMore={{ onClick: () => onGoToTab('projects') }}
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
          viewMore={{ onClick: () => onGoToTab('documents') }}
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
            scopeParams={{ teamId }}
            limit={10}
            enabled={!!teamId}
            onViewMore={() => onGoToTab('drafts')}
          />
        )}
      </SimpleGrid>
    </Stack>
  );
}
