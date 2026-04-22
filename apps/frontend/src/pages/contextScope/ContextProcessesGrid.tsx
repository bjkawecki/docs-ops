import { Card, Text } from '@mantine/core';
import { ContextGrid, ScopeCard } from '../../components/contexts';
import type { ProcessItem } from './contextScopeSharedTypes';

export type ContextProcessesGridProps = {
  pending: boolean;
  processes: ProcessItem[];
  loadingMessage?: string;
  emptyMessage: string;
};

export function ContextProcessesGrid({
  pending,
  processes,
  loadingMessage = 'Loading processes…',
  emptyMessage,
}: ContextProcessesGridProps) {
  return (
    <>
      {pending ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            {loadingMessage}
          </Text>
        </Card>
      ) : processes.length === 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            {emptyMessage}
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
    </>
  );
}
