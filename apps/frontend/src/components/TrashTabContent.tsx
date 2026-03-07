import { Button, Group, Select, Stack, Table, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';
import { useCallback } from 'react';
import { apiFetch } from '../api/client';

export interface TrashTabContentProps {
  scope: 'personal' | 'company' | 'department' | 'team';
  companyId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
}

export type TrashArchiveItem = {
  type: 'document' | 'process' | 'project';
  id: string;
  displayTitle: string;
  contextName: string;
  deletedAt?: string;
  archivedAt?: string;
};

type TrashResponse = {
  items: TrashArchiveItem[];
  total: number;
  limit: number;
  offset: number;
};

function itemHref(item: TrashArchiveItem): string {
  if (item.type === 'document') return `/documents/${item.id}`;
  if (item.type === 'process') return `/processes/${item.id}`;
  return `/projects/${item.id}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function TrashTabContent({ scope, companyId, departmentId, teamId }: TrashTabContentProps) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const typeFilter = searchParams.get('type') ?? '';
  const sortBy = searchParams.get('sortBy') ?? 'deletedAt';
  const sortOrder = searchParams.get('sortOrder') ?? 'desc';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = 25;
  const offset = (page - 1) * limit;

  const params = new URLSearchParams({
    scope,
    limit: String(limit),
    offset: String(offset),
    sortBy,
    sortOrder,
  });
  if (scope === 'company' && companyId) params.set('companyId', companyId);
  if (scope === 'department' && departmentId) params.set('departmentId', departmentId);
  if (scope === 'team' && teamId) params.set('teamId', teamId);
  if (typeFilter) params.set('type', typeFilter);

  const enabled =
    scope === 'personal' ||
    (scope === 'company' && !!companyId) ||
    (scope === 'department' && !!departmentId) ||
    (scope === 'team' && !!teamId);

  const { data, isPending } = useQuery({
    queryKey: [
      'me',
      'trash',
      scope,
      companyId ?? '',
      departmentId ?? '',
      teamId ?? '',
      params.toString(),
    ],
    queryFn: async (): Promise<TrashResponse> => {
      const res = await apiFetch(`/api/v1/me/trash?${params}`);
      if (!res.ok) throw new Error('Failed to load trash');
      return (await res.json()) as TrashResponse;
    },
    enabled,
  });

  const setFilter = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
        next.delete('page');
        return next;
      });
    },
    [setSearchParams]
  );

  const setSort = useCallback(
    (col: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const order = sortBy === col && sortOrder === 'desc' ? 'asc' : 'desc';
        next.set('sortBy', col);
        next.set('sortOrder', order);
        next.delete('page');
        return next;
      });
    },
    [setSearchParams, sortBy, sortOrder]
  );

  const setPage = useCallback(
    (p: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (p <= 1) next.delete('page');
        else next.set('page', String(p));
        return next;
      });
    },
    [setSearchParams]
  );

  const handleRestore = async (item: TrashArchiveItem) => {
    let res: Response;
    if (item.type === 'document') {
      res = await apiFetch(`/api/v1/documents/${item.id}/restore`, { method: 'POST' });
    } else if (item.type === 'process') {
      res = await apiFetch(`/api/v1/processes/${item.id}/restore`, { method: 'POST' });
    } else {
      res = await apiFetch(`/api/v1/projects/${item.id}/restore`, { method: 'POST' });
    }
    if (res.status === 204) {
      void queryClient.invalidateQueries({ queryKey: ['me', 'trash'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'archive'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'personal-documents'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      notifications.show({ title: 'Restored', message: 'Item was restored.', color: 'green' });
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
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit) || 1;

  if (isPending) {
    return (
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Loading…
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Select
        label="Type"
        placeholder="All"
        data={[
          { value: '', label: 'All' },
          { value: 'document', label: 'Document' },
          { value: 'process', label: 'Process' },
          { value: 'project', label: 'Project' },
        ]}
        value={typeFilter || null}
        onChange={(v) => setFilter('type', v ?? '')}
        clearable
        style={{ maxWidth: 160 }}
      />

      <Table withTableBorder withColumnBorders striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Type</Table.Th>
            <Table.Th style={{ cursor: 'pointer' }} onClick={() => setSort('title')}>
              Title {sortBy === 'title' && (sortOrder === 'asc' ? '↑' : '↓')}
            </Table.Th>
            <Table.Th>Context</Table.Th>
            <Table.Th style={{ cursor: 'pointer' }} onClick={() => setSort('deletedAt')}>
              Deleted at {sortBy === 'deletedAt' && (sortOrder === 'asc' ? '↑' : '↓')}
            </Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text size="sm" c="dimmed">
                  No items in trash.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            items.map((item) => (
              <Table.Tr key={`${item.type}-${item.id}`}>
                <Table.Td>
                  <Text size="sm" tt="capitalize">
                    {item.type}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text
                    component={Link}
                    to={itemHref(item)}
                    fw={500}
                    size="sm"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    {item.displayTitle || item.id}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {item.contextName}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{item.deletedAt ? formatDate(item.deletedAt) : '—'}</Text>
                </Table.Td>
                <Table.Td>
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<IconRefresh size={14} />}
                    onClick={() => void handleRestore(item)}
                  >
                    Restore
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>

      {totalPages > 1 && (
        <Group gap="xs">
          <Button variant="subtle" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Text size="sm" c="dimmed">
            Page {page} of {totalPages} ({total} items)
          </Text>
          <Button
            variant="subtle"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </Group>
      )}
    </Stack>
  );
}
