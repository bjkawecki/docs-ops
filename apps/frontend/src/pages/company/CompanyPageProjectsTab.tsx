import { Card, Stack, Text } from '@mantine/core';
import { ContextGrid, ScopeCard } from '../../components/contexts';
import type { ProjectItem } from '../contextScope/contextScopeSharedTypes';

type Props = {
  effectiveCompanyId: string | null | undefined;
  projectsPending: boolean;
  projects: ProjectItem[];
};

export function CompanyPageProjectsTab({ effectiveCompanyId, projectsPending, projects }: Props) {
  return (
    <Stack gap="md">
      {effectiveCompanyId == null ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No company selected.
          </Text>
        </Card>
      ) : projectsPending ? (
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
}
