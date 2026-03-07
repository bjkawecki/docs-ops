import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';
import { apiFetch } from '../api/client';

export interface TrashTabContentProps {
  scope: 'personal' | 'company';
  companyId?: string | null;
}

type TrashItem = {
  id: string;
  title: string;
  contextId: string | null;
  deletedAt: string;
  updatedAt: string;
  contextName: string;
};

export function TrashTabContent({ scope, companyId }: TrashTabContentProps) {
  const queryClient = useQueryClient();
  const params = new URLSearchParams({ scope, limit: '50', offset: '0' });
  if (scope === 'company' && companyId) params.set('companyId', companyId);

  const { data, isPending } = useQuery({
    queryKey: ['me', 'trash', scope, companyId ?? ''],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/me/trash?${params}`);
      if (!res.ok) throw new Error('Failed to load trash');
      return (await res.json()) as { items: TrashItem[]; total: number };
    },
    enabled: scope === 'personal' || (scope === 'company' && !!companyId),
  });

  const handleRestore = async (documentId: string) => {
    const res = await apiFetch(`/api/v1/documents/${documentId}/restore`, {
      method: 'POST',
    });
    if (res.status === 204) {
      void queryClient.invalidateQueries({ queryKey: ['me', 'trash'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'personal-documents'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
      notifications.show({ title: 'Restored', message: 'Document was restored.', color: 'green' });
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
          No items in trash.
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
                {d.contextName} · {d.deletedAt ? new Date(d.deletedAt).toLocaleString() : ''}
              </Text>
            </div>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={() => void handleRestore(d.id)}
            >
              Restore
            </Button>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
