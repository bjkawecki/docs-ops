import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { IconArchiveOff } from '@tabler/icons-react';
import { apiFetch } from '../api/client';

export interface ArchiveTabContentProps {
  scope: 'personal' | 'company';
  companyId?: string | null;
}

type ArchiveItem = {
  id: string;
  title: string;
  contextId: string | null;
  archivedAt: string;
  updatedAt: string;
  contextName: string;
};

export function ArchiveTabContent({ scope, companyId }: ArchiveTabContentProps) {
  const queryClient = useQueryClient();
  const params = new URLSearchParams({ scope, limit: '50', offset: '0' });
  if (scope === 'company' && companyId) params.set('companyId', companyId);

  const { data, isPending } = useQuery({
    queryKey: ['me', 'archive', scope, companyId ?? ''],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/me/archive?${params}`);
      if (!res.ok) throw new Error('Failed to load archive');
      return (await res.json()) as { items: ArchiveItem[]; total: number };
    },
    enabled: scope === 'personal' || (scope === 'company' && !!companyId),
  });

  const handleUnarchive = async (documentId: string) => {
    const res = await apiFetch(`/api/v1/documents/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: null }),
    });
    if (res.ok) {
      void queryClient.invalidateQueries({ queryKey: ['me', 'archive'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'personal-documents'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
      notifications.show({
        title: 'Unarchived',
        message: 'Document was restored to active.',
        color: 'green',
      });
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      notifications.show({
        title: 'Error',
        message: body?.error ?? res.statusText,
        color: 'red',
      });
    }
  };

  const items = data?.items ?? [];
  if (isPending) {
    return (
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Loading…
        </Text>
      </Card>
    );
  }
  if (items.length === 0) {
    return (
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          No archived documents.
        </Text>
      </Card>
    );
  }
  return (
    <Stack gap="xs">
      {items.map((d) => (
        <Card key={d.id} withBorder padding="sm">
          <Group justify="space-between" wrap="nowrap">
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text
                component={Link}
                to={`/documents/${d.id}`}
                fw={500}
                size="sm"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {d.title || d.id}
              </Text>
              <Text size="xs" c="dimmed">
                {d.contextName} · {d.archivedAt ? new Date(d.archivedAt).toLocaleString() : ''}
              </Text>
            </div>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconArchiveOff size={14} />}
              onClick={() => void handleUnarchive(d.id)}
            >
              Unarchive
            </Button>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
