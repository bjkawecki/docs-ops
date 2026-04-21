import {
  Button,
  Card,
  Group,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { IconArchiveOff } from '@tabler/icons-react';
import { useCallback, useMemo } from 'react';
import { apiFetch } from '../api/client';
import { formatTableDate } from '../lib/formatDate';
import type { TrashArchiveItem } from './TrashTabContent';
import { SortableTableTh } from './SortableTableTh';

export interface ArchiveTabContentProps {
  scope: 'personal' | 'company' | 'department' | 'team';
  companyId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
}

type ArchiveResponse = {
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

export function ArchiveTabContent({
  scope,
  companyId,
  departmentId,
  teamId,
}: ArchiveTabContentProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const typeFilter = searchParams.get('type') ?? '';
  const archiveSearch = searchParams.get('archiveSearch') ?? '';
  const sortBy = searchParams.get('sortBy') ?? 'archivedAt';
  const sortOrder = searchParams.get('sortOrder') ?? 'desc';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limitParam = searchParams.get('archiveLimit');
  const limit = limitParam
    ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || DEFAULT_PAGE_SIZE))
    : DEFAULT_PAGE_SIZE;
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
      'archive',
      scope,
      companyId ?? '',
      departmentId ?? '',
      teamId ?? '',
      params.toString(),
    ],
    queryFn: async (): Promise<ArchiveResponse> => {
      const res = await apiFetch(`/api/v1/me/archive?${params}`);
      if (!res.ok) throw new Error('Failed to load archive');
      return (await res.json()) as ArchiveResponse;
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

  const setArchiveLimit = useCallback(
    (value: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('archiveLimit', String(value));
        next.delete('page');
        return next;
      });
    },
    [setSearchParams]
  );

  const handleUnarchive = async (item: TrashArchiveItem) => {
    let res: Response;
    if (item.type === 'document') {
      res = await apiFetch(`/api/v1/documents/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivedAt: null }),
      });
    } else if (item.type === 'process') {
      res = await apiFetch(`/api/v1/processes/${item.id}/unarchive`, { method: 'POST' });
    } else {
      res = await apiFetch(`/api/v1/projects/${item.id}/unarchive`, { method: 'POST' });
    }
    if (res.ok || res.status === 204) {
      void queryClient.invalidateQueries({ queryKey: ['me', 'archive'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'trash'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'personal-documents'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
      void queryClient.invalidateQueries({ queryKey: ['contexts'] });
      void queryClient.invalidateQueries({ queryKey: ['processes'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      notifications.show({
        title: 'Unarchived',
        message: 'Item was restored to active.',
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

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit) || 1;

  const sortedItems = useMemo(() => {
    const list = data?.items ?? [];
    if (sortBy === 'type') {
      return [...list].sort((a, b) => {
        const c = (a.type ?? '').localeCompare(b.type ?? '');
        return sortOrder === 'asc' ? c : -c;
      });
    }
    if (sortBy === 'contextName') {
      return [...list].sort((a, b) => {
        const va = (a.contextName ?? '').toLowerCase();
        const vb = (b.contextName ?? '').toLowerCase();
        const c = va.localeCompare(vb);
        return sortOrder === 'asc' ? c : -c;
      });
    }
    return list;
  }, [data?.items, sortBy, sortOrder]);

  const searchLower = archiveSearch.trim().toLowerCase();
  const filteredItems = useMemo(
    () =>
      searchLower
        ? sortedItems.filter(
            (item) =>
              (item.displayTitle ?? '').toLowerCase().includes(searchLower) ||
              (item.contextName ?? '').toLowerCase().includes(searchLower)
          )
        : sortedItems,
    [sortedItems, searchLower]
  );

  if (isPending) {
    return (
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Loading archive…
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      <Group gap="md" wrap="wrap" align="flex-end">
        <TextInput
          label="Search"
          placeholder="Search by name"
          value={archiveSearch}
          onChange={(e) => setFilter('archiveSearch', e.currentTarget.value)}
          style={{ minWidth: 200 }}
        />
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
          style={{ minWidth: 140 }}
        />
        <Text size="sm" c="dimmed" style={{ marginLeft: 'auto' }}>
          {archiveSearch.trim()
            ? `${filteredItems.length} of ${total} item${total !== 1 ? 's' : ''}`
            : `${total} item${total !== 1 ? 's' : ''}`}
        </Text>
        <Select
          label="Per page"
          data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          value={String(limit)}
          onChange={(v) => v && setArchiveLimit(parseInt(v, 10))}
          style={{ width: 90 }}
        />
      </Group>

      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <SortableTableTh
              label="Type"
              column="type"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onClick={() => setSort('type')}
            />
            <SortableTableTh
              label="Title"
              column="title"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onClick={() => setSort('title')}
            />
            <SortableTableTh
              label="Context"
              column="contextName"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onClick={() => setSort('contextName')}
            />
            <SortableTableTh
              label="Archived at"
              column="archivedAt"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onClick={() => setSort('archivedAt')}
            />
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filteredItems.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text size="sm" c="dimmed">
                  {sortedItems.length === 0 ? 'No archived items.' : 'No items match the search.'}
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            filteredItems.map((item) => (
              <Table.Tr
                key={`${item.type}-${item.id}`}
                data-clickable-table-row
                onClick={() => {
                  void navigate(itemHref(item));
                }}
              >
                <Table.Td>
                  <Text size="sm" tt="capitalize">
                    {item.type}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text fw={500} size="sm">
                    {item.displayTitle || item.id}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {item.contextName}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {item.archivedAt ? formatTableDate(item.archivedAt, { withTime: true }) : '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<IconArchiveOff size={14} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleUnarchive(item);
                    }}
                  >
                    Unarchive
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>

      <Group justify="flex-end">
        <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
      </Group>
    </Stack>
  );
}
