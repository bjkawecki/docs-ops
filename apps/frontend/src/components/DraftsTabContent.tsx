import {
  Badge,
  Card,
  Group,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useMeDrafts,
  type MeDraftsScopeParams,
  type DraftDocumentItem,
  type OpenDraftRequestItem,
} from '../hooks/useMeDrafts';
import { formatTableDate } from '../lib/formatDate';
import { SortableTableTh } from './SortableTableTh';

type DraftsSortBy = 'title' | 'scopeName' | 'updatedAt' | 'pending';

export interface DraftsTabContentProps {
  scopeParams: MeDraftsScopeParams;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

function hasPendingRequest(documentId: string, openDraftRequests: OpenDraftRequestItem[]): boolean {
  return openDraftRequests.some((r) => r.documentId === documentId);
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
  const draftsPending = searchParams.get('draftsPending') ?? '';

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
    const openDraftRequests = data?.openDraftRequests ?? [];
    const pendingSet = new Set(openDraftRequests.map((r) => r.documentId));
    const key = (d: DraftDocumentItem): string | number | boolean => {
      switch (sortBy) {
        case 'title':
          return (d.title ?? '').toLowerCase();
        case 'scopeName':
          return (d.scopeName ?? '').toLowerCase();
        case 'updatedAt':
          return new Date(d.updatedAt).getTime();
        case 'pending':
          return pendingSet.has(d.id);
        default:
          return new Date(d.updatedAt).getTime();
      }
    };
    const mult = sortOrder === 'asc' ? 1 : -1;
    return [...draftDocuments].sort((a, b) => {
      const va = key(a);
      const vb = key(b);
      if (typeof va === 'boolean' && typeof vb === 'boolean') {
        const raw = va === vb ? 0 : va ? 1 : -1;
        return mult * raw;
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return mult * (va - vb);
      }
      const c = String(va).localeCompare(String(vb));
      return mult * c;
    });
  }, [data?.draftDocuments, data?.openDraftRequests, sortBy, sortOrder]);

  const searchLower = draftsSearch.trim().toLowerCase();
  const filteredDrafts = useMemo(() => {
    const openDraftRequests = data?.openDraftRequests ?? [];
    let list = sortedDrafts;
    if (searchLower) {
      list = list.filter(
        (d) =>
          (d.title ?? '').toLowerCase().includes(searchLower) ||
          (d.scopeName ?? '').toLowerCase().includes(searchLower)
      );
    }
    if (draftsPending === 'yes') {
      list = list.filter((d) => hasPendingRequest(d.id, openDraftRequests));
    } else if (draftsPending === 'no') {
      list = list.filter((d) => !hasPendingRequest(d.id, openDraftRequests));
    }
    return list;
  }, [data?.openDraftRequests, sortedDrafts, searchLower, draftsPending]);

  if (isPending) {
    return (
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Loading drafts…
        </Text>
      </Card>
    );
  }

  const openDraftRequests = data?.openDraftRequests ?? [];
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
            label="Pending"
            placeholder="All"
            data={[
              { value: '', label: 'All' },
              { value: 'yes', label: 'Pending' },
              { value: 'no', label: 'Not pending' },
            ]}
            value={draftsPending || null}
            onChange={(v) => setDraftsFilter('draftsPending', v ?? '')}
            clearable
            style={{ minWidth: 140 }}
          />
          <Text size="sm" c="dimmed" style={{ marginLeft: 'auto' }}>
            {draftsSearch.trim() || draftsPending
              ? `${filteredDrafts.length} of ${total} draft${total !== 1 ? 's' : ''}`
              : `${total} draft${total !== 1 ? 's' : ''}`}
          </Text>
          <Select
            label="Per page"
            data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            value={String(limit)}
            onChange={(v) => v && setDraftsLimit(parseInt(v, 10))}
            style={{ width: 90 }}
          />
        </Group>
      )}
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <SortableTableTh
              label="Title"
              column="title"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onClick={() => setSort('title')}
            />
            <SortableTableTh
              label="Context"
              column="scopeName"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onClick={() => setSort('scopeName')}
            />
            <SortableTableTh
              label="Pending"
              column="pending"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onClick={() => setSort('pending')}
            />
            <SortableTableTh
              label="Last updated"
              column="updatedAt"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onClick={() => setSort('updatedAt')}
            />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filteredDrafts.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text size="sm" c="dimmed">
                  {sortedDrafts.length === 0 ? 'No drafts' : 'No drafts match the filters.'}
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            filteredDrafts.map((d: DraftDocumentItem) => (
              <Table.Tr
                key={d.id}
                data-clickable-table-row
                onClick={() => {
                  void navigate(`/documents/${d.id}`);
                }}
              >
                <Table.Td>
                  <Text fw={500} size="sm">
                    {d.title || d.id}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {d.scopeName || '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {hasPendingRequest(d.id, openDraftRequests) ? (
                    <Badge size="sm" variant="light">
                      Open
                    </Badge>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatTableDate(d.updatedAt)}</Text>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>

      {useUrlPagination && (
        <Group justify="flex-end">
          <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
        </Group>
      )}
    </Stack>
  );
}
