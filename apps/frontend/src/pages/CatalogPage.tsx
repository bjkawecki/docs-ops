import {
  Badge,
  Box,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Select,
  MultiSelect,
  Pagination,
  Button,
  Anchor,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { apiFetch } from '../api/client';

const PAGE_SIZE = 25;

type TagItem = { id: string; name: string };
type CatalogDocument = {
  id: string;
  title: string;
  contextId: string;
  createdAt: string;
  updatedAt: string;
  documentTags: { tag: { id: string; name: string } }[];
  contextType: 'process' | 'project' | 'userSpace';
  contextName: string;
  ownerDisplay: string;
  contextProcessId: string | null;
  contextProjectId: string | null;
  contextUserSpaceId: string | null;
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
  if (doc.contextUserSpaceId) return `/user-spaces/${doc.contextUserSpaceId}`;
  return '#';
}

/**
 * Catalog: all accessible documents as table (filter/sort/search).
 * No tab area per §7.
 */
export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const contextType = searchParams.get('contextType') ?? '';
  const ownerFilter = searchParams.get('owner') ?? 'all';
  const tagIds = useMemo(() => {
    const t = searchParams.get('tagIds');
    if (!t) return [];
    return t.split(',').filter(Boolean);
  }, [searchParams]);
  const search = searchParams.get('search') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

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

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/tags');
      if (!res.ok) throw new Error('Failed to load tags');
      return (await res.json()) as TagItem[];
    },
  });

  const limit = PAGE_SIZE;
  const offset = (page - 1) * limit;
  const catalogQueryParamsString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (contextType && ['process', 'project', 'userSpace'].includes(contextType)) {
      params.set('contextType', contextType);
    }
    if (ownerFilter === 'personal') {
      params.set('contextType', 'userSpace');
    }
    tagIds.forEach((id) => params.append('tagIds', id));
    if (search.trim()) params.set('search', search.trim());
    return params.toString();
  }, [limit, offset, contextType, ownerFilter, tagIds, search]);

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

  return (
    <>
      <PageHeader
        title="Catalog"
        description="All documents you can access. Filter, search, and sort."
      />
      <Box style={{ display: 'flex', gap: 'var(--mantine-spacing-md)', flexWrap: 'wrap' }}>
        <Paper withBorder p="md" style={{ minWidth: 220, flex: '0 0 auto' }}>
          <Stack gap="md">
            <Text size="sm" fw={600}>
              Filters
            </Text>
            <Select
              label="Context type"
              placeholder="All"
              data={[
                { value: '', label: 'All' },
                { value: 'process', label: 'Process' },
                { value: 'project', label: 'Project' },
                { value: 'userSpace', label: 'User space' },
              ]}
              value={contextType || null}
              onChange={(v) => setFilter('contextType', v ?? '')}
              clearable
            />
            <Select
              label="Owner"
              placeholder="All"
              data={[
                { value: 'all', label: 'All' },
                { value: 'personal', label: 'Personal' },
              ]}
              value={ownerFilter}
              onChange={(v) => setFilter('owner', v ?? 'all')}
            />
            <MultiSelect
              label="Tags"
              placeholder="All tags"
              data={tagOptions}
              value={tagIds}
              onChange={(v) => setFilter('tagIds', v)}
              clearable
              searchable
            />
          </Stack>
        </Paper>

        <Box style={{ flex: 1, minWidth: 0 }}>
          <Stack gap="md">
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <TextInput
                placeholder="Filter by title..."
                value={search}
                onChange={(e) => setFilter('search', e.currentTarget.value)}
                style={{ maxWidth: 280 }}
              />
              <Text size="sm" c="dimmed">
                {data != null ? `${data.total} document${data.total !== 1 ? 's' : ''}` : '—'}
              </Text>
            </Group>

            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Context</Table.Th>
                  <Table.Th>Context type</Table.Th>
                  <Table.Th>Owner</Table.Th>
                  <Table.Th>Tags</Table.Th>
                  <Table.Th>Updated</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {isPending && (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Text size="sm" c="dimmed">
                        Loading…
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {!isPending && isError && (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Text size="sm" c="red">
                        Failed to load documents.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {!isPending && !isError && data && data.items.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
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
                      <Table.Td>
                        <Anchor component={Link} to={`/documents/${doc.id}`} size="sm">
                          {doc.title || doc.id}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>
                        <Anchor
                          component={Link}
                          to={contextHref(doc)}
                          size="sm"
                          title={doc.contextName}
                        >
                          {doc.contextName || '—'}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {doc.contextType === 'process'
                            ? 'Process'
                            : doc.contextType === 'project'
                              ? 'Project'
                              : 'User space'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{doc.ownerDisplay}</Text>
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
                        <Button
                          component={Link}
                          to={`/documents/${doc.id}`}
                          variant="light"
                          size="xs"
                        >
                          Open
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
              </Table.Tbody>
            </Table>
            {!isPending && !isError && data && totalPages > 1 && (
              <Group justify="flex-end">
                <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
              </Group>
            )}
          </Stack>
        </Box>
      </Box>
    </>
  );
}
