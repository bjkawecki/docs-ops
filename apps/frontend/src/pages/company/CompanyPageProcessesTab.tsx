import { Card, Stack, Text } from '@mantine/core';
import { ContextGrid, ScopeCard } from '../../components/contexts';
import type { ProcessItem } from '../contextScope/contextScopeSharedTypes';

type Props = {
  effectiveCompanyId: string | null | undefined;
  processesPending: boolean;
  processes: ProcessItem[];
};

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
      ) : processesPending ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Loading processes…
          </Text>
        </Card>
      ) : processes.length === 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No processes yet. Use "Create" to add one.
          </Text>
        </Card>
      ) : (
        <ContextGrid>
          {processes.map((p) => (
            <ScopeCard
              key={p.id}
              title={p.name}
              href={`/processes/${p.id}`}
              documents={p.documents}
            />
          ))}
        </ContextGrid>
      )}
    </Stack>
  );
}
