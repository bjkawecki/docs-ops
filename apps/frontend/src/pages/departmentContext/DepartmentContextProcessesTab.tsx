import { Stack } from '@mantine/core';
import { ContextProcessesGrid } from '../contextScope/ContextProcessesGrid';
import type { ProcessItem } from '../contextScope/contextScopeSharedTypes';

type Props = {
  processesPending: boolean;
  processes: ProcessItem[];
};

const EMPTY_PROCESSES = 'No processes yet. Use "Create" to add one.';

export function DepartmentContextProcessesTab({ processesPending, processes }: Props) {
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
