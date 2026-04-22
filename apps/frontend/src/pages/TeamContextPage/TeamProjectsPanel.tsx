import { Stack } from '@mantine/core';
import { ContextProjectsGrid } from '../contextScope/ContextProjectsGrid';
import type { ProjectItem } from './teamContextPageTypes';

export type TeamProjectsPanelProps = {
  projectsPending: boolean;
  projects: ProjectItem[];
};

const EMPTY_PROJECTS = 'No projects yet. Use "Create" to add one.';

export function TeamProjectsPanel({ projectsPending, projects }: TeamProjectsPanelProps) {
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
