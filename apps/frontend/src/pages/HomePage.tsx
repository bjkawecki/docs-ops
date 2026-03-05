import { Badge, Box, Button, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DocopsLogo } from '../components/DocopsLogo';
import { RecentItemsCard, SectionCard } from '../components/contexts';
import { useMe } from '../hooks/useMe';
import { useMeDrafts } from '../hooks/useMeDrafts';
import { getAggregatedRecentItems } from '../hooks/useRecentItems';
import { apiFetch } from '../api/client';

const LATEST_LIMIT = 10;

type PinnedItem = {
  id: string;
  scopeType: 'team' | 'department' | 'company';
  scopeId: string;
  documentId: string;
  documentTitle: string;
  documentHref: string;
  order: number;
  pinnedAt: string;
  canUnpin: boolean;
};
type PinnedResponse = { items: PinnedItem[] };

type CatalogDocument = {
  id: string;
  title: string;
  updatedAt: string;
};
type CatalogResponse = {
  items: CatalogDocument[];
  total: number;
  limit: number;
  offset: number;
};

function scopeTypeLabel(scopeType: string): string {
  return scopeType.charAt(0).toUpperCase() + scopeType.slice(1);
}

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

export function HomePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: me } = useMe();
  const recentItems = getAggregatedRecentItems(me?.preferences?.recentItemsByScope, 10);

  const {
    data: pinnedData,
    isPending: pinnedPending,
    isError: pinnedError,
  } = useQuery({
    queryKey: ['pinned', 'dashboard'],
    queryFn: async (): Promise<PinnedResponse> => {
      const res = await apiFetch('/api/v1/pinned');
      if (!res.ok) throw new Error('Failed to load pinned documents');
      return (await res.json()) as PinnedResponse;
    },
  });
  const pinnedItems = pinnedData?.items ?? [];

  const {
    data: latestData,
    isPending: latestPending,
    isError: latestError,
  } = useQuery({
    queryKey: ['catalog-documents', 'dashboard-latest', LATEST_LIMIT, 0],
    queryFn: async (): Promise<CatalogResponse> => {
      const res = await apiFetch(
        `/api/v1/documents?${new URLSearchParams({ limit: String(LATEST_LIMIT), offset: '0' })}`
      );
      if (!res.ok) throw new Error('Failed to load documents');
      return (await res.json()) as CatalogResponse;
    },
  });

  const latestItems = latestData?.items ?? [];

  const { data: draftsData, isPending: draftsPending } = useMeDrafts({}, { limit: 10, offset: 0 });
  const draftDocuments = draftsData?.draftDocuments ?? [];
  const openDraftRequests = draftsData?.openDraftRequests ?? [];
  const hasDrafts = draftDocuments.length > 0 || openDraftRequests.length > 0;

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const search = searchQuery.trim();
    if (search) {
      void navigate({ pathname: '/catalog', search: `?search=${encodeURIComponent(search)}` });
    } else {
      void navigate('/catalog');
    }
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Stack align="center" mb="md" gap="md" py="xl" pt="3rem" pb="2rem">
        <Group gap="lg" justify="center">
          <DocopsLogo width={112} height={112} />
          <Text fw={600} style={{ fontSize: '2.5rem' }}>
            DocsOps
          </Text>
        </Group>
      </Stack>

      <Stack align="center" gap="md" mb="md">
        <Box component="form" onSubmit={handleSearchSubmit} w="100%" maw={600} mx="auto">
          <TextInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Search documents…"
            size="md"
            leftSection={<SearchIcon />}
            rightSection={
              searchQuery.length > 0 ? (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  Clear
                </Button>
              ) : undefined
            }
            aria-label="Search documents"
          />
        </Box>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <SectionCard title="Pinned">
          {pinnedPending ? (
            <Text size="sm" c="dimmed">
              Loading…
            </Text>
          ) : pinnedError ? (
            <Text size="sm" c="red">
              Failed to load pinned documents.
            </Text>
          ) : pinnedItems.length === 0 ? (
            <Text size="sm" c="dimmed">
              Scope leads can pin documents for their team, department or company. Pinned documents
              will appear here.
            </Text>
          ) : (
            <Stack gap={4}>
              {pinnedItems.map((item) => (
                <Group key={item.id} gap="xs" wrap="nowrap">
                  <Badge size="sm" variant="light">
                    {scopeTypeLabel(item.scopeType)}
                  </Badge>
                  <Link
                    to={item.documentHref}
                    style={{ fontSize: 'var(--mantine-font-size-sm)', flex: 1, minWidth: 0 }}
                  >
                    {item.documentTitle}
                  </Link>
                </Group>
              ))}
            </Stack>
          )}
        </SectionCard>

        <RecentItemsCard items={recentItems} />

        <SectionCard title="Latest documents" viewMoreHref="/catalog">
          {latestPending ? (
            <Text size="sm" c="dimmed">
              Loading…
            </Text>
          ) : latestError ? (
            <Text size="sm" c="red">
              Failed to load documents.
            </Text>
          ) : latestItems.length === 0 ? (
            <Text size="sm" c="dimmed">
              No documents yet.
            </Text>
          ) : (
            <Stack gap={4}>
              {latestItems.map((doc) => (
                <Link
                  key={doc.id}
                  to={`/documents/${doc.id}`}
                  style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                >
                  {doc.title}
                  {doc.updatedAt && (
                    <Text component="span" size="xs" c="dimmed" ml="xs">
                      — {formatDate(doc.updatedAt)}
                    </Text>
                  )}
                </Link>
              ))}
            </Stack>
          )}
        </SectionCard>

        <SectionCard title="Drafts / Pending review" viewMoreHref="/personal">
          {draftsPending ? (
            <Text size="sm" c="dimmed">
              Loading…
            </Text>
          ) : !hasDrafts ? (
            <Text size="sm" c="dimmed">
              No drafts or pending review.
            </Text>
          ) : (
            <Stack gap={4}>
              {draftDocuments.map((d) => (
                <Link
                  key={d.id}
                  to={`/documents/${d.id}`}
                  style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                >
                  {d.title || d.id}
                </Link>
              ))}
              {openDraftRequests.map((dr) => (
                <Group key={dr.id} gap="xs" wrap="nowrap">
                  <Badge size="sm" variant="light">
                    Pending review
                  </Badge>
                  <Link
                    to={`/documents/${dr.documentId}`}
                    style={{ fontSize: 'var(--mantine-font-size-sm)', flex: 1, minWidth: 0 }}
                  >
                    {dr.documentTitle || dr.documentId}
                  </Link>
                </Group>
              ))}
            </Stack>
          )}
        </SectionCard>
      </SimpleGrid>
    </Box>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
