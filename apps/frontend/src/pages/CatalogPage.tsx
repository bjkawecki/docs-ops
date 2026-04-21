import {
  Badge,
  Box,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Select,
  MultiSelect,
  Pagination,
  Anchor,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconArrowDown, IconArrowUp, IconSelector } from '@tabler/icons-react';
import { PageHeader } from '../components/PageHeader';
import { apiFetch } from '../api/client';
import { renderSearchSnippet } from '../utils/renderSearchSnippet';
import '../utils/searchSnippetMark.css';
import './CatalogPage.css';

/** Renders text with search term wrapped in <mark> (case-insensitive). */
function highlightMatch(text: string, searchTerm: string): ReactNode {
  const t = text || '';
  const s = searchTerm.trim();
  if (!s) return t;
  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  const parts = t.split(re);
  return parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
}

const CATALOG_PAGE_SIZE_KEY = 'docsops-catalog-page-size';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

type SortBy =
  | 'title'
  | 'updatedAt'
  | 'createdAt'
  | 'contextName'
  | 'contextType'
  | 'ownerDisplay'
  | 'relevance';
type SortOrder = 'asc' | 'desc';

type TagItem = { id: string; name: string };
type CatalogDocument = {
  id: string;
  title: string;
  contextId: string;
  createdAt: string;
  updatedAt: string;
  documentTags: { tag: { id: string; name: string } }[];
  contextType: 'process' | 'project' | 'subcontext';
  contextName: string;
  ownerDisplay: string;
  /** Link to owner scope (company, department, team, or personal). Null if no context. */
  ownerHref: string | null;
  contextProcessId: string | null;
  contextProjectId: string | null;
  currentPublishedVersionNumber: number | null;
  searchRank?: number | null;
  searchSnippet?: string | null;
};
type CatalogResponse = {
  items: CatalogDocument[];
  total: number;
  limit: number;
  offset: number;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function contextHref(doc: CatalogDocument): string {
  if (doc.contextProcessId) return `/processes/${doc.contextProcessId}`;
  if (doc.contextProjectId) return `/projects/${doc.contextProjectId}`;
  return '#';
}

function parseStoredPageSize(): number {
  try {
    const v = window.localStorage.getItem(CATALOG_PAGE_SIZE_KEY);
    if (v == null) return DEFAULT_PAGE_SIZE;
    const n = parseInt(v, 10);
    return PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number])
      ? n
      : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

/**
 * Catalog: all accessible documents as table (filter/sort/search).
 * No tab area per §7.
 */
export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const contextType = searchParams.get('contextType') ?? '';
  const tagIds = useMemo(() => {
    const t = searchParams.get('tagIds');
    if (!t) return [];
    return t.split(',').filter(Boolean);
  }, [searchParams]);
  const search = searchParams.get('search') ?? '';
  const sortBy = (searchParams.get('sortBy') as SortBy) || 'updatedAt';
  const sortOrder = (searchParams.get('sortOrder') as SortOrder) || 'desc';
  const urlLimit = searchParams.get('limit');
  const limitFromStorage = parseStoredPageSize();
  const limit = urlLimit
    ? Math.min(100, Math.max(1, parseInt(urlLimit, 10) || DEFAULT_PAGE_SIZE))
    : limitFromStorage;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  // Sync limit to URL when coming from localStorage (so URL reflects persisted preference)
  useEffect(() => {
    if (!urlLimit && limitFromStorage !== DEFAULT_PAGE_SIZE) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('limit', String(limitFromStorage));
        return next;
      });
    }
  }, [urlLimit, limitFromStorage, setSearchParams]);

  const setFilter = useCallback(
    (key: string, value: string | string[] | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
          next.delete(key);
        } else if (Array.isArray(value)) {
          next.set(key, value.join(','));
        } else {
          next.set(key, value);
        }
        next.delete('page');
        return next;
      });
    },
    [setSearchParams]
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

  const setSort = useCallback(
    (by: SortBy, order?: SortOrder) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('sortBy', by);
        if (by === 'relevance') {
          next.set('sortOrder', 'desc');
        } else {
          next.set('sortOrder', order ?? (sortBy === by && sortOrder === 'desc' ? 'asc' : 'desc'));
        }
        next.delete('page');
        return next;
      });
    },
    [setSearchParams, sortBy, sortOrder]
  );

  const setLimit = useCallback(
    (value: number) => {
      try {
        window.localStorage.setItem(CATALOG_PAGE_SIZE_KEY, String(value));
      } catch {
        /* ignore */
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('limit', String(value));
        next.delete('page');
        return next;
      });
    },
    [setSearchParams]
  );

  // All tags from scopes the user can read in the catalog (for filter dropdown + search).
  const { data: tagsData } = useQuery({
    queryKey: ['tags', 'catalog'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/tags/catalog');
      if (!res.ok) throw new Error('Failed to load tags');
      return (await res.json()) as TagItem[];
    },
  });

  const offset = (page - 1) * limit;
  const catalogQueryParamsString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (contextType && ['process', 'project'].includes(contextType)) {
      params.set('contextType', contextType);
    }
    tagIds.forEach((id) => params.append('tagIds', id));
    if (search.trim()) params.set('search', search.trim());
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    return params.toString();
  }, [limit, offset, contextType, tagIds, search, sortBy, sortOrder]);

  const { data, isPending, isError } = useQuery({
    queryKey: ['catalog-documents', catalogQueryParamsString],
    queryFn: async (): Promise<CatalogResponse> => {
      const res = await apiFetch(`/api/v1/documents?${catalogQueryParamsString}`);
      if (!res.ok) throw new Error('Failed to load documents');
      return (await res.json()) as CatalogResponse;
    },
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const tagOptions = useMemo(
    () => (tagsData ?? []).map((t) => ({ value: t.id, label: t.name })),
    [tagsData]
  );

  const SortIcon = ({ column }: { column: SortBy }) => {
    if (sortBy !== column) return <IconSelector size={14} style={{ opacity: 0.5 }} />;
    return sortOrder === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />;
  };

  const ThSort = ({
    column,
    label,
    sticky,
  }: {
    column: SortBy;
    label: string;
    sticky?: boolean;
  }) => (
    <Table.Th
      className={sticky ? 'catalog-table-name-cell' : undefined}
      style={{ cursor: 'pointer', userSelect: 'none' }}
      aria-disabled={column === 'relevance'}
      onClick={() => setSort(column)}
    >
      <Group gap={4} wrap="nowrap">
        {label}
        <SortIcon column={column} />
      </Group>
    </Table.Th>
  );

  return (
    <Box>
      <PageHeader
        title="Catalog"
        description="All documents you can access. Filter, search, and sort."
      />
      <Stack gap="md">
        <Box className="catalog-sticky-filters">
          <Group gap="md" wrap="wrap" align="flex-end">
            <TextInput
              label="Search"
              placeholder="Search by title or content"
              value={search}
              onChange={(e) => setFilter('search', e.currentTarget.value)}
              style={{ minWidth: 200 }}
            />
            <Select
              label="Context type"
              placeholder="All"
              data={[
                { value: '', label: 'All' },
                { value: 'process', label: 'Process' },
                { value: 'project', label: 'Project' },
              ]}
              value={contextType || null}
              onChange={(v) => setFilter('contextType', v ?? '')}
              clearable
              style={{ minWidth: 140 }}
            />
            <Select
              label="Sort by"
              data={[
                { value: 'updatedAt', label: 'Updated' },
                { value: 'createdAt', label: 'Created' },
                { value: 'title', label: 'Name' },
                { value: 'ownerDisplay', label: 'Owner' },
                { value: 'contextType', label: 'Context type' },
                { value: 'contextName', label: 'Context' },
                { value: 'relevance', label: 'Relevance' },
              ]}
              value={sortBy}
              onChange={(value) => {
                if (!value) return;
                setSort(value as SortBy, value === 'relevance' ? 'desc' : undefined);
              }}
              style={{ minWidth: 150 }}
            />
            <MultiSelect
              label="Tags"
              placeholder="Search or select tags"
              data={tagOptions}
              value={tagIds}
              onChange={(v) => setFilter('tagIds', v)}
              clearable
              searchable
              nothingFoundMessage="No tags match"
              style={{ minWidth: 200 }}
            />
            <Text size="sm" c="dimmed" style={{ marginLeft: 'auto' }}>
              {data != null ? `${data.total} document${data.total !== 1 ? 's' : ''}` : '—'}
            </Text>
            <Select
              label="Per page"
              data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
              value={String(limit)}
              onChange={(v) => v && setLimit(parseInt(v, 10))}
              style={{ width: 90 }}
            />
          </Group>
        </Box>

        <Box className="docsops-search-snippet-mark" style={{ overflowX: 'auto' }}>
          <Table withTableBorder withColumnBorders className="catalog-table-hover">
            <Table.Thead>
              <Table.Tr>
                <ThSort column="title" label="Name" sticky />
                <Table.Th>Version</Table.Th>
                <ThSort column="ownerDisplay" label="Owner" />
                <ThSort column="contextType" label="Context type" />
                <ThSort column="contextName" label="Context" />
                <Table.Th>Tags</Table.Th>
                <ThSort column="updatedAt" label="Updated" />
                <ThSort column="createdAt" label="Created" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isPending && (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text size="sm" c="dimmed">
                      Loading…
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {!isPending && isError && (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text size="sm" c="red">
                      Failed to load documents.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {!isPending && !isError && data && data.items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text size="sm" c="dimmed">
                      No documents match the filters.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {!isPending &&
                !isError &&
                data &&
                data.items.length > 0 &&
                data.items.map((doc) => (
                  <Table.Tr key={doc.id}>
                    <Table.Td className="catalog-table-name-cell">
                      <Anchor component={Link} to={`/documents/${doc.id}`} size="sm">
                        {highlightMatch(doc.title || doc.id, search)}
                      </Anchor>
                      {search.trim() && doc.searchSnippet ? (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {renderSearchSnippet(doc.searchSnippet)}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {doc.currentPublishedVersionNumber != null
                          ? `v${doc.currentPublishedVersionNumber}`
                          : 'Draft'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {doc.ownerHref ? (
                        <Anchor
                          component={Link}
                          to={doc.ownerHref}
                          size="sm"
                          className="catalog-table-link-style"
                        >
                          {doc.ownerDisplay}
                        </Anchor>
                      ) : (
                        <Text size="sm" component="span" className="catalog-table-link-style">
                          {doc.ownerDisplay}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {doc.contextType === 'process'
                          ? 'Process'
                          : doc.contextType === 'subcontext'
                            ? 'Subcontext'
                            : 'Project'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Anchor
                        component={Link}
                        to={contextHref(doc)}
                        size="sm"
                        title={doc.contextName}
                        className="catalog-table-link-style"
                      >
                        {doc.contextName || '—'}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {doc.documentTags.map((dt) => (
                          <Badge key={dt.tag.id} size="sm" variant="light">
                            {dt.tag.name}
                          </Badge>
                        ))}
                        {doc.documentTags.length === 0 && (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(doc.updatedAt)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(doc.createdAt)}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        </Box>
        {!isPending && !isError && data && totalPages > 1 && (
          <Group justify="flex-end">
            <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
          </Group>
        )}
      </Stack>
    </Box>
  );
}
