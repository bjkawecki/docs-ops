import { Card, Text } from '@mantine/core';
import { ContextGrid, ScopeCard } from '../../components/contexts';
import type { ProjectItem } from './contextScopeSharedTypes';

export type ContextProjectsGridProps = {
  pending: boolean;
  projects: ProjectItem[];
  loadingMessage?: string;
  emptyMessage: string;
};

export function ContextProjectsGrid({
  pending,
  projects,
  loadingMessage = 'Loading projects…',
  emptyMessage,
}: ContextProjectsGridProps) {
  return (
    <>
      {pending ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            {loadingMessage}
          </Text>
        </Card>
      ) : projects.length === 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            {emptyMessage}
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
    </>
  );
}
