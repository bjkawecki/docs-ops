import { Box, Button, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DocopsLogo } from '../components/DocopsLogo';
import { RecentItemsCard, SectionCard } from '../components/contexts';
import { useMe } from '../hooks/useMe';
import { getAggregatedRecentItems } from '../hooks/useRecentItems';
import { apiFetch } from '../api/client';

const LATEST_LIMIT = 10;

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
    <>
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
      </SimpleGrid>
    </>
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
