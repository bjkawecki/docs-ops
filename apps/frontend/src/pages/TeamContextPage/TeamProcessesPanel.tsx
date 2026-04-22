import { Stack } from '@mantine/core';
import { ContextProcessesGrid } from '../contextScope/ContextProcessesGrid';
import type { ProcessItem } from './teamContextPageTypes';

export type TeamProcessesPanelProps = {
  processesPending: boolean;
  processes: ProcessItem[];
};

const EMPTY_PROCESSES = 'No processes yet. Use "Create" to add one.';

export function TeamProcessesPanel({ processesPending, processes }: TeamProcessesPanelProps) {
  return (
    <Stack gap="md">
      <ContextProcessesGrid
        pending={processesPending}
        processes={processes}
        emptyMessage={EMPTY_PROCESSES}
      />
    </Stack>
  );
}
