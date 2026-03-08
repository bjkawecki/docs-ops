import { Badge, Box, Button, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import {
  IconBuildingSkyscraper,
  IconCalendar,
  IconClock,
  IconFileText,
  IconPin,
  IconPencil,
  IconSitemap,
  IconUser,
  IconUsersGroup,
} from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DocopsLogo } from '../components/DocopsLogo';
import { RecentItemsCard, SectionCard } from '../components/contexts';
import { useMe } from '../hooks/useMe';
import { useMeDrafts, type DraftScopeType } from '../hooks/useMeDrafts';
import { getAggregatedRecentItems } from '../hooks/useRecentItems';
import { apiFetch } from '../api/client';

const CARD_TITLE_ICON_SIZE = 18;

/** Max items shown per dashboard card (Recent, Latest, Pinned, Drafts). */
const DASHBOARD_CARD_LIMIT = 5;

type PinnedItem = {
  id: string;
  scopeType: 'team' | 'department' | 'company';
  scopeId: string;
  scopeName: string | null;
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
  scopeType?: DraftScopeType;
  scopeName?: string;
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

const SCOPE_ICON_SIZE = 14;
/** Vertical gap between rows in dashboard card lists. */
const DASHBOARD_ITEM_GAP = 8;
/** Horizontal gap between columns (title, scope, date) within a row. */
const ROW_PADDING = 20;
/** Title column width: as wide as the longest title (max-content), not a fixed rem. */
const TITLE_COLUMN_WIDTH = 'max-content';

/** Renders [icon] scopeName with left padding for separation from document title. */
function ScopeSuffix({ scopeType, scopeName }: { scopeType: DraftScopeType; scopeName: string }) {
  const ScopeIcon =
    scopeType === 'team'
      ? IconUsersGroup
      : scopeType === 'department'
        ? IconSitemap
        : scopeType === 'company'
          ? IconBuildingSkyscraper
          : IconUser;
  return (
    <Text
      component="span"
      size="xs"
      c="dimmed"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        lineHeight: 1,
      }}
    >
      <ScopeIcon
        size={SCOPE_ICON_SIZE}
        style={{ flexShrink: 0, color: 'var(--mantine-color-dimmed)', display: 'block' }}
        aria-hidden
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1,
        }}
        title={scopeName}
      >
        {scopeName}
      </span>
    </Text>
  );
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
  const recentItems = getAggregatedRecentItems(
    me?.preferences?.recentItemsByScope,
    DASHBOARD_CARD_LIMIT
  );

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
  const pinnedItems = (pinnedData?.items ?? []).slice(0, DASHBOARD_CARD_LIMIT);

  const {
    data: latestData,
    isPending: latestPending,
    isError: latestError,
  } = useQuery({
    queryKey: ['catalog-documents', 'dashboard-latest', DASHBOARD_CARD_LIMIT, 0],
    queryFn: async (): Promise<CatalogResponse> => {
      const res = await apiFetch(
        `/api/v1/documents?${new URLSearchParams({ limit: String(DASHBOARD_CARD_LIMIT), offset: '0' })}`
      );
      if (!res.ok) throw new Error('Failed to load documents');
      return (await res.json()) as CatalogResponse;
    },
  });

  const latestItems = latestData?.items ?? [];

  const { data: draftsData, isPending: draftsPending } = useMeDrafts(
    {},
    { limit: DASHBOARD_CARD_LIMIT, offset: 0 }
  );
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
    <Box>
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
        <SectionCard
          title="Pinned"
          titleIcon={<IconPin size={CARD_TITLE_ICON_SIZE} style={{ flexShrink: 0 }} />}
        >
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
                    {item.scopeName != null && item.scopeName !== '' && (
                      <Text component="span" size="xs" c="dimmed" ml={4}>
                        ({item.scopeName})
                      </Text>
                    )}
                  </Link>
                </Group>
              ))}
            </Stack>
          )}
        </SectionCard>

        <RecentItemsCard
          items={recentItems}
          titleIcon={<IconClock size={CARD_TITLE_ICON_SIZE} style={{ flexShrink: 0 }} />}
        />

        <SectionCard
          title="Latest documents"
          titleIcon={<IconFileText size={CARD_TITLE_ICON_SIZE} style={{ flexShrink: 0 }} />}
          viewMoreHref="/catalog"
        >
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
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: `${TITLE_COLUMN_WIDTH} auto auto`,
                gap: `${DASHBOARD_ITEM_GAP}px ${ROW_PADDING}px`,
                alignItems: 'center',
                width: 'fit-content',
                minWidth: 0,
              }}
            >
              {latestItems.flatMap((doc) => {
                const scopeType = doc.scopeType ?? 'personal';
                const scopeName = doc.scopeName ?? 'Personal';
                return [
                  <Link
                    key={`${doc.id}-t`}
                    to={`/documents/${doc.id}`}
                    style={{
                      fontSize: 'var(--mantine-font-size-sm)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={doc.title}
                  >
                    {doc.title}
                  </Link>,
                  <ScopeSuffix key={`${doc.id}-s`} scopeType={scopeType} scopeName={scopeName} />,
                  doc.updatedAt ? (
                    <Group key={`${doc.id}-d`} gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                      <IconCalendar
                        size={SCOPE_ICON_SIZE}
                        style={{ flexShrink: 0, color: 'var(--mantine-color-dimmed)' }}
                        aria-hidden
                      />
                      <Text size="xs" c="dimmed">
                        {formatDate(doc.updatedAt)}
                      </Text>
                    </Group>
                  ) : (
                    <span key={`${doc.id}-d`} />
                  ),
                ];
              })}
            </Box>
          )}
        </SectionCard>

        <SectionCard
          title="Drafts / Pending review"
          titleIcon={<IconPencil size={CARD_TITLE_ICON_SIZE} style={{ flexShrink: 0 }} />}
          viewMoreHref="/personal"
        >
          {draftsPending ? (
            <Text size="sm" c="dimmed">
              Loading…
            </Text>
          ) : !hasDrafts ? (
            <Text size="sm" c="dimmed">
              No drafts or pending review.
            </Text>
          ) : (
            <Stack gap={DASHBOARD_ITEM_GAP}>
              {draftDocuments.length > 0 && (
                <Box
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `${TITLE_COLUMN_WIDTH} auto`,
                    gap: `${DASHBOARD_ITEM_GAP}px ${ROW_PADDING}px`,
                    alignItems: 'center',
                    width: 'fit-content',
                    minWidth: 0,
                  }}
                >
                  {draftDocuments.flatMap((d) => {
                    const title = d.title || d.id;
                    return [
                      <Link
                        key={`${d.id}-t`}
                        to={`/documents/${d.id}`}
                        style={{
                          fontSize: 'var(--mantine-font-size-sm)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={title}
                      >
                        {title}
                      </Link>,
                      <ScopeSuffix
                        key={`${d.id}-s`}
                        scopeType={d.scopeType}
                        scopeName={d.scopeName}
                      />,
                    ];
                  })}
                </Box>
              )}
              {openDraftRequests.length > 0 && (
                <Box
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `auto ${TITLE_COLUMN_WIDTH} auto`,
                    gap: `${DASHBOARD_ITEM_GAP}px ${ROW_PADDING}px`,
                    alignItems: 'center',
                    width: 'fit-content',
                    minWidth: 0,
                  }}
                >
                  {openDraftRequests.flatMap((dr) => {
                    const title = dr.documentTitle || dr.documentId;
                    return [
                      <Badge key={`${dr.id}-b`} size="sm" variant="light" style={{ flexShrink: 0 }}>
                        Pending review
                      </Badge>,
                      <Link
                        key={`${dr.id}-t`}
                        to={`/documents/${dr.documentId}`}
                        style={{
                          fontSize: 'var(--mantine-font-size-sm)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={title}
                      >
                        {title}
                      </Link>,
                      <ScopeSuffix
                        key={`${dr.id}-s`}
                        scopeType={dr.scopeType}
                        scopeName={dr.scopeName}
                      />,
                    ];
                  })}
                </Box>
              )}
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
