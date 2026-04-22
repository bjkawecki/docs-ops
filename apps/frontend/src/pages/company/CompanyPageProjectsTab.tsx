import { Card, Stack, Text } from '@mantine/core';
import { ContextProjectsGrid } from '../contextScope/ContextProjectsGrid';
import type { ProjectItem } from '../contextScope/contextScopeSharedTypes';

type Props = {
  effectiveCompanyId: string | null | undefined;
  projectsPending: boolean;
  projects: ProjectItem[];
};

const EMPTY_PROJECTS = 'No projects yet. Use "Create" to add one.';

export function CompanyPageProjectsTab({ effectiveCompanyId, projectsPending, projects }: Props) {
  return (
    <Stack gap="md">
      {effectiveCompanyId == null ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No company selected.
          </Text>
        </Card>
      ) : (
        <ContextProjectsGrid
          pending={projectsPending}
          projects={projects}
          emptyMessage={EMPTY_PROJECTS}
        />
      )}
    </Stack>
  );
}
