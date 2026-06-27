import { Card, Group, Pagination, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useMeDrafts,
  type MeDraftsScopeParams,
  type DraftDocumentItem,
} from '../../hooks/useMeDrafts';
import { formatTableDate } from '../../lib/formatDate';
import { SortableTableTh } from '../ui/SortableTableTh';

type DraftsSortBy = 'title' | 'scopeName' | 'updatedAt';

export interface DraftsTabContentProps {
  scopeParams: MeDraftsScopeParams;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

const DRAFTS_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function DraftsTabContent({
  scopeParams,
  limit: limitProp,
  offset: offsetProp,
  enabled = true,
}: DraftsTabContentProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sortBy = (searchParams.get('draftsSortBy') ?? 'updatedAt') as DraftsSortBy;
  const sortOrder = searchParams.get('draftsSortOrder') ?? 'desc';
  const page = Math.max(1, parseInt(searchParams.get('draftsPage') ?? '1', 10));
  const useUrlPagination = limitProp === undefined && offsetProp === undefined;
  const draftsLimitParam = useUrlPagination ? searchParams.get('draftsLimit') : null;
  const draftsLimit = draftsLimitParam
    ? Math.min(100, Math.max(1, parseInt(draftsLimitParam, 10) || DRAFTS_PAGE_SIZE))
    : DRAFTS_PAGE_SIZE;
  const limit = limitProp ?? draftsLimit;
  const offset = offsetProp ?? (useUrlPagination ? (page - 1) * draftsLimit : 0);
  const draftsSearch = searchParams.get('draftsSearch') ?? '';

  const setDraftsFilter = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
        next.delete('draftsPage');
        return next;
      });
    },
    [setSearchParams]
  );

  const setSort = useCallback(
    (col: DraftsSortBy) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const order = sortBy === col && sortOrder === 'desc' ? 'asc' : 'desc';
        next.set('draftsSortBy', col);
        next.set('draftsSortOrder', order);
        next.delete('draftsPage');
        return next;
      });
    },
    [setSearchParams, sortBy, sortOrder]
  );

  const setPage = useCallback(
    (p: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (p <= 1) next.delete('draftsPage');
        else next.set('draftsPage', String(p));
        return next;
      });
    },
    [setSearchParams]
  );

  const setDraftsLimit = useCallback(
    (value: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('draftsLimit', String(value));
        next.delete('draftsPage');
        return next;
      });
    },
    [setSearchParams]
  );

  const { data, isPending } = useMeDrafts(scopeParams, { limit, offset, enabled });

  const sortedDrafts = useMemo(() => {
    const draftDocuments = data?.draftDocuments ?? [];
    const key = (d: DraftDocumentItem): string | number => {
      switch (sortBy) {
        case 'title':
          return (d.title ?? '').toLowerCase();
        case 'scopeName':
          return (d.scopeName ?? '').toLowerCase();
        case 'updatedAt':
          return new Date(d.updatedAt).getTime();
        default:
          return new Date(d.updatedAt).getTime();
      }
    };
    const mult = sortOrder === 'asc' ? 1 : -1;
    return [...draftDocuments].sort((a, b) => {
      const va = key(a);
      const vb = key(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        return mult * (va - vb);
      }
      const c = String(va).localeCompare(String(vb));
      return mult * c;
    });
  }, [data?.draftDocuments, sortBy, sortOrder]);

  const searchLower = draftsSearch.trim().toLowerCase();
  const filteredDrafts = useMemo(() => {
    if (!searchLower) return sortedDrafts;
    return sortedDrafts.filter(
      (d) =>
        (d.title ?? '').toLowerCase().includes(searchLower) ||
        (d.scopeName ?? '').toLowerCase().includes(searchLower)
    );
  }, [sortedDrafts, searchLower]);

  if (isPending) {
    return (
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Loading drafts…
        </Text>
      </Card>
    );
  }

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <Stack gap="md">
      {useUrlPagination && (
        <Group gap="md" wrap="wrap" align="flex-end">
          <TextInput
            label="Search"
            placeholder="Search by name"
            value={draftsSearch}
            onChange={(e) => setDraftsFilter('draftsSearch', e.currentTarget.value)}
            style={{ minWidth: 200 }}
          />
          <Select
            label="Page size"
            data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            value={String(draftsLimit)}
            onChange={(v) => setDraftsLimit(Number(v ?? DRAFTS_PAGE_SIZE))}
            w={100}
          />
        </Group>
      )}
      {filteredDrafts.length === 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No unpublished drafts.
          </Text>
        </Card>
      ) : (
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <SortableTableTh
                label="Title"
                active={sortBy === 'title'}
                order={sortOrder as 'asc' | 'desc'}
                onSort={() => setSort('title')}
              />
              <SortableTableTh
                label="Scope"
                active={sortBy === 'scopeName'}
                order={sortOrder as 'asc' | 'desc'}
                onSort={() => setSort('scopeName')}
              />
              <SortableTableTh
                label="Updated"
                active={sortBy === 'updatedAt'}
                order={sortOrder as 'asc' | 'desc'}
                onSort={() => setSort('updatedAt')}
              />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredDrafts.map((d) => (
              <Table.Tr
                key={d.id}
                style={{ cursor: 'pointer' }}
                onClick={() => void navigate(`/documents/${d.id}`)}
              >
                <Table.Td>{d.title}</Table.Td>
                <Table.Td>{d.scopeName}</Table.Td>
                <Table.Td>{formatTableDate(d.updatedAt)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {useUrlPagination && totalPages > 1 && (
        <Group justify="center">
          <Pagination total={totalPages} value={page} onChange={setPage} />
        </Group>
      )}
    </Stack>
  );
}
