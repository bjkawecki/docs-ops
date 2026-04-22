import { Card, Stack, Text } from '@mantine/core';
import { ContextProcessesGrid } from '../contextScope/ContextProcessesGrid';
import type { ProcessItem } from '../contextScope/contextScopeSharedTypes';

type Props = {
  effectiveCompanyId: string | null | undefined;
  processesPending: boolean;
  processes: ProcessItem[];
};

const EMPTY_PROCESSES = 'No processes yet. Use "Create" to add one.';

export function CompanyPageProcessesTab({
  effectiveCompanyId,
  processesPending,
  processes,
}: Props) {
  return (
    <Stack gap="md">
      {effectiveCompanyId == null ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No company selected. Contexts are loaded per company.
          </Text>
        </Card>
      ) : (
        <ContextProcessesGrid
          pending={processesPending}
          processes={processes}
          emptyMessage={EMPTY_PROCESSES}
        />
      )}
    </Stack>
  );
}
