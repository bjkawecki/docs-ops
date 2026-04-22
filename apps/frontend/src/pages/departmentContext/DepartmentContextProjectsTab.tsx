import { Stack } from '@mantine/core';
import { ContextProjectsGrid } from '../contextScope/ContextProjectsGrid';
import type { ProjectItem } from '../contextScope/contextScopeSharedTypes';

type Props = {
  projectsPending: boolean;
  projects: ProjectItem[];
};

const EMPTY_PROJECTS = 'No projects yet. Use "Create" to add one.';

export function DepartmentContextProjectsTab({ projectsPending, projects }: Props) {
  return (
    <Stack gap="md">
      <ContextProjectsGrid
        pending={projectsPending}
        projects={projects}
        emptyMessage={EMPTY_PROJECTS}
      />
    </Stack>
  );
}
