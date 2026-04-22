import type { ReactNode } from 'react';
import { SimpleGrid, Stack, Text } from '@mantine/core';
import { IconBriefcase, IconFileText, IconRoute } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { ScopeCard } from '../../components/contexts';
import type { ProcessItem, ProjectItem } from './contextScopeSharedTypes';

export type ScopedContextOverviewDocumentRow = {
  id: string;
  title: string;
};

export type ScopedContextOverviewCardsProps = {
  onGoToTab: (tab: string) => void;
  processesCount: number;
  projectsCount: number;
  processesPreview: ProcessItem[];
  projectsPreview: ProjectItem[];
  docsTotal: number;
  /** Company: when true, Processes/Projects/Documents show "No company selected." */
  noCompanySelected: boolean;
  /** Company overview only: loading state inside Documents card when a company is selected */
  docsPending?: boolean;
  /** Rows shown as document links (caller passes full list or slice(0, 5)) */
  documentRows: ScopedContextOverviewDocumentRow[];
  draftsSlot?: ReactNode;
};

const linkSm = { fontSize: 'var(--mantine-font-size-sm)' } as const;

export function ScopedContextOverviewCards({
  onGoToTab,
  processesCount,
  projectsCount,
  processesPreview,
  projectsPreview,
  docsTotal,
  noCompanySelected,
  docsPending,
  documentRows,
  draftsSlot,
}: ScopedContextOverviewCardsProps) {
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ScopeCard
          title="Processes"
          titleCount={processesCount}
          titleIcon={<IconRoute size={18} style={{ flexShrink: 0 }} />}
          viewMore={{ onClick: () => onGoToTab('processes') }}
        >
          {noCompanySelected ? (
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
                <Link key={p.id} to={`/processes/${p.id}`} style={linkSm}>
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
          {noCompanySelected ? (
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
                <Link key={p.id} to={`/projects/${p.id}`} style={linkSm}>
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
          {noCompanySelected ? (
            <Text size="sm" c="dimmed">
              No company selected.
            </Text>
          ) : docsPending ? (
            <Text size="sm" c="dimmed">
              Loading documents…
            </Text>
          ) : documentRows.length === 0 ? (
            <Text size="sm" c="dimmed">
              No documents yet.
            </Text>
          ) : (
            <Stack gap={4} align="flex-start">
              {documentRows.map((d) => (
                <Link key={d.id} to={`/documents/${d.id}`} style={linkSm}>
                  {d.title || d.id}
                </Link>
              ))}
            </Stack>
          )}
        </ScopeCard>
        {draftsSlot}
      </SimpleGrid>
    </Stack>
  );
}
