import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconBuildingSkyscraper,
  IconCalendar,
  IconClipboardCheck,
  IconClock,
  IconBriefcase,
  IconFileText,
  IconNotes,
  IconRoute,
  IconSubtask,
  IconPin,
  IconPencil,
  IconSitemap,
  IconUser,
  IconUsersGroup,
  IconX,
} from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DocopsLogo } from '../components/DocopsLogo';
import { RecentItemsCard, SectionCard } from '../components/contexts';
import { useMe } from '../hooks/useMe';
import { useMeDrafts, type DraftScopeType } from '../hooks/useMeDrafts';
import { useResolvedColorScheme } from '../hooks/useResolvedColorScheme';
import { getAggregatedRecentItems } from '../hooks/useRecentItems';
import { apiFetch } from '../api/client';
import { renderSearchSnippet } from '../utils/renderSearchSnippet';
import '../utils/searchSnippetMark.css';

const CARD_TITLE_ICON_SIZE = 18;

/** Max items shown per dashboard card (Recent, Latest, Pinned, Drafts). */
const DASHBOARD_CARD_LIMIT = 5;

const DASHBOARD_SEARCH_DEBOUNCE_MS = 280;
const DASHBOARD_SEARCH_MIN_CHARS = 2;
const DASHBOARD_SEARCH_MODAL_LIMIT = 8;

type DashboardSearchItem = {
  id: string;
  title: string;
  contextName: string | null;
  contextType: 'process' | 'project' | 'subcontext' | null;
  snippet: string | null;
  updatedAt: string;
  rank: number;
};
type DashboardSearchResponse = {
  items: DashboardSearchItem[];
  total: number;
  limit: number;
  offset: number;
};

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
const SEARCH_HIT_TITLE_ICON = 18;
const SEARCH_HIT_CONTEXT_ICON = 15;
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
        style={{ flexShrink: 0, display: 'block' }}
        color="var(--mantine-color-dimmed)"
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

function DashboardSearchContextIcon({
  contextType,
}: {
  contextType: DashboardSearchItem['contextType'];
}) {
  const IconComp =
    contextType === 'process'
      ? IconRoute
      : contextType === 'project'
        ? IconBriefcase
        : contextType === 'subcontext'
          ? IconSubtask
          : IconNotes;
  return (
    <IconComp
      size={SEARCH_HIT_CONTEXT_ICON}
      style={{ flexShrink: 0, display: 'block' }}
      color="var(--mantine-color-dimmed)"
      aria-hidden
    />
  );
}

function dashboardSearchContextSubtitle(doc: DashboardSearchItem): string | null {
  const name = doc.contextName?.trim();
  if (name) return name;
  if (doc.contextType === 'process') return 'Prozess';
  if (doc.contextType === 'project') return 'Projekt';
  if (doc.contextType === 'subcontext') return 'Unterkontext';
  return null;
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
  const resolvedColorScheme = useResolvedColorScheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [debouncedModalSearch, setDebouncedModalSearch] = useState('');
  const [isTabVisible, setIsTabVisible] = useState(() => document.visibilityState === 'visible');
  const heroSearchInputRef = useRef<HTMLInputElement>(null);
  const modalSearchInputRef = useRef<HTMLInputElement>(null);
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

  const isAdmin = me?.user?.isAdmin === true;
  const isCompanyLead = (me?.identity?.companyLeads?.length ?? 0) > 0;
  const isDepartmentLead = (me?.identity?.departmentLeads?.length ?? 0) > 0;
  const hasReviewRights =
    isAdmin ||
    isDepartmentLead ||
    isCompanyLead ||
    (me?.identity?.teams?.some((t) => t.role === 'leader') ?? false);

  useEffect(() => {
    const onVisibility = () => setIsTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!searchModalOpen) return;
    const trimmed = modalSearch.trim();
    const id = window.setTimeout(
      () => setDebouncedModalSearch(trimmed),
      DASHBOARD_SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(id);
  }, [modalSearch, searchModalOpen]);

  useEffect(() => {
    if (!searchModalOpen) return;
    const raf = window.requestAnimationFrame(() => modalSearchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [searchModalOpen]);

  const dashboardSearchEnabled =
    searchModalOpen && isTabVisible && debouncedModalSearch.length >= DASHBOARD_SEARCH_MIN_CHARS;

  const {
    data: dashboardSearchData,
    isFetching: dashboardSearchFetching,
    isError: dashboardSearchError,
  } = useQuery({
    queryKey: ['dashboard-search', debouncedModalSearch],
    queryFn: async (): Promise<DashboardSearchResponse> => {
      const params = new URLSearchParams({
        q: debouncedModalSearch,
        limit: String(DASHBOARD_SEARCH_MODAL_LIMIT),
        offset: '0',
      });
      const res = await apiFetch(`/api/v1/search/documents?${params}`);
      if (!res.ok) throw new Error('Failed to search documents');
      return (await res.json()) as DashboardSearchResponse;
    },
    enabled: dashboardSearchEnabled,
    placeholderData: (previousData) => previousData,
  });

  const trimmedModalSearch = modalSearch.trim();
  const trimmedDebouncedSearch = debouncedModalSearch.trim();
  const searchInputReadyForQuery =
    searchModalOpen && isTabVisible && trimmedModalSearch.length >= DASHBOARD_SEARCH_MIN_CHARS;
  const searchDebouncePending =
    searchInputReadyForQuery && trimmedModalSearch !== trimmedDebouncedSearch;
  const showSearchSpinner =
    searchInputReadyForQuery && (searchDebouncePending || dashboardSearchFetching);

  const closeSearchModal = () => {
    setSearchModalOpen(false);
    window.requestAnimationFrame(() => heroSearchInputRef.current?.focus());
  };

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const search = searchQuery.trim();
    if (!search) {
      void navigate('/catalog');
      return;
    }
    setModalSearch(search);
    setDebouncedModalSearch(search);
    setSearchModalOpen(true);
  };

  const goToCatalogFromModal = () => {
    const q = modalSearch.trim();
    closeSearchModal();
    void navigate({
      pathname: '/catalog',
      search: q ? `?search=${encodeURIComponent(q)}&sortBy=relevance` : '?sortBy=relevance',
    });
  };

  return (
    <Box>
      <Stack align="center" mb="md" gap="md" py="xl" pt="3rem" pb="2rem">
        <Group gap="lg" justify="center">
          <DocopsLogo width={112} height={112} />
          <Box component="span">
            <Text
              component="span"
              c={resolvedColorScheme === 'dark' ? 'white' : 'dimmed'}
              style={{ fontSize: '2.7rem', fontWeight: 600 }}
            >
              Docs
            </Text>
            <Text
              component="span"
              c="var(--mantine-primary-color-filled)"
              style={{ fontSize: '2.7rem', fontWeight: 600 }}
            >
              Ops
            </Text>
          </Box>
        </Group>
      </Stack>

      <Stack align="center" gap="md" mb="md">
        <Box component="form" onSubmit={handleSearchSubmit} w="100%" maw={600} mx="auto">
          <TextInput
            ref={heroSearchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="Search documents…"
            size="md"
            leftSection={<SearchIcon />}
            rightSection={
              searchQuery.length > 0 ? (
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  type="button"
                >
                  <IconX size={16} stroke={1.75} />
                </ActionIcon>
              ) : undefined
            }
            rightSectionWidth={40}
            aria-label="Search documents"
          />
        </Box>
      </Stack>

      <Modal
        opened={searchModalOpen}
        onClose={closeSearchModal}
        title={
          <Stack gap={4}>
            <Title order={3} fz="lg" fw={600}>
              Dokument-Suche
            </Title>
            <Text size="xs" c="dimmed">
              Erste Treffer, maximal {DASHBOARD_SEARCH_MODAL_LIMIT} in diesem Dialog
            </Text>
          </Stack>
        }
        centered
        radius="md"
        size="lg"
        trapFocus
        closeOnEscape
        styles={{
          content: {
            maxHeight: 'min(82dvh, 720px)',
            display: 'flex',
            flexDirection: 'column',
          },
          body: {
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            overflow: 'hidden',
          },
        }}
      >
        <Box
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <Box
            px="md"
            pt="xs"
            pb="sm"
            style={{
              flexShrink: 0,
              borderBottom: '1px solid var(--mantine-color-default-border)',
              backgroundColor: 'var(--mantine-color-body)',
            }}
          >
            <TextInput
              ref={modalSearchInputRef}
              value={modalSearch}
              onChange={(e) => setModalSearch(e.currentTarget.value)}
              placeholder="Suchbegriff…"
              leftSection={<SearchIcon />}
              aria-label="Suchbegriff im Modal"
            />
            {debouncedModalSearch.length > 0 &&
              debouncedModalSearch.length < DASHBOARD_SEARCH_MIN_CHARS && (
                <Text size="sm" c="dimmed" mt="xs">
                  Mindestens {DASHBOARD_SEARCH_MIN_CHARS} Zeichen eingeben.
                </Text>
              )}
            {searchInputReadyForQuery && (
              <Text size="xs" c="dimmed" mt="xs" lh={1.4}>
                {showSearchSpinner
                  ? searchDebouncePending
                    ? 'Eingabe wird übernommen…'
                    : 'Suche läuft…'
                  : dashboardSearchError
                    ? null
                    : dashboardSearchData != null
                      ? `${dashboardSearchData.total} Treffer · bis zu ${DASHBOARD_SEARCH_MODAL_LIMIT} hier`
                      : null}
              </Text>
            )}
          </Box>
          <Box
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              paddingLeft: 'var(--mantine-spacing-md)',
              paddingRight: 'var(--mantine-spacing-md)',
              paddingTop: 'var(--mantine-spacing-sm)',
              paddingBottom: 'var(--mantine-spacing-md)',
            }}
          >
            {dashboardSearchEnabled && dashboardSearchError && !showSearchSpinner && (
              <Text size="sm" c="red" mb="sm">
                Suche fehlgeschlagen. Im Katalog erneut versuchen oder später noch einmal testen.
              </Text>
            )}
            {dashboardSearchEnabled && (
              <Box pos="relative" mih={showSearchSpinner ? 140 : 0}>
                <LoadingOverlay
                  visible={showSearchSpinner}
                  overlayProps={{ radius: 'sm', blur: 2 }}
                  loaderProps={{ type: 'oval' }}
                  zIndex={400}
                />
                {!dashboardSearchError &&
                  dashboardSearchData &&
                  dashboardSearchData.items.length === 0 &&
                  !showSearchSpinner && (
                    <Text size="sm" c="dimmed">
                      Keine Treffer. Der Suchindex kann hinter den Katalogdaten hängen – im Katalog
                      steht ggf. ein weiterer Treffer-Modus zur Verfügung.
                    </Text>
                  )}
                {!dashboardSearchError &&
                  dashboardSearchData &&
                  dashboardSearchData.items.length > 0 && (
                    <Stack
                      component="ul"
                      gap="sm"
                      style={{ listStyle: 'none', margin: 0, padding: 0 }}
                    >
                      {dashboardSearchData.items.map((doc) => {
                        const subtitle = dashboardSearchContextSubtitle(doc);
                        const showSnippet = (doc.snippet?.trim() ?? '') !== '';
                        const showMeta = subtitle != null || doc.contextType != null;
                        return (
                          <Paper
                            key={doc.id}
                            component="li"
                            withBorder
                            p="sm"
                            radius="md"
                            style={{ minWidth: 0 }}
                          >
                            <Stack gap={8}>
                              <Group gap={8} wrap="nowrap" align="flex-start">
                                <IconFileText
                                  size={SEARCH_HIT_TITLE_ICON}
                                  style={{ flexShrink: 0, marginTop: 1 }}
                                  color="var(--mantine-color-dimmed)"
                                  aria-hidden
                                />
                                <Text component="div" size="sm" fw={500} style={{ minWidth: 0 }}>
                                  <Link to={`/documents/${doc.id}`} onClick={closeSearchModal}>
                                    {doc.title || doc.id}
                                  </Link>
                                </Text>
                              </Group>
                              {showMeta && (
                                <Group gap={8} wrap="nowrap" align="center">
                                  <DashboardSearchContextIcon contextType={doc.contextType} />
                                  <Text size="xs" c="dimmed" lineClamp={1} style={{ minWidth: 0 }}>
                                    {subtitle ?? ''}
                                  </Text>
                                </Group>
                              )}
                              {showSnippet && (
                                <>
                                  <Divider variant="dotted" />
                                  <Box
                                    component="blockquote"
                                    className="docsops-search-hit-quote"
                                    cite={`/documents/${doc.id}`}
                                    style={{ marginTop: 2 }}
                                  >
                                    <Box
                                      component="div"
                                      className="docsops-search-hit-quote-inner docsops-search-snippet-mark"
                                    >
                                      {renderSearchSnippet(doc.snippet!.trim())}
                                    </Box>
                                  </Box>
                                </>
                              )}
                            </Stack>
                          </Paper>
                        );
                      })}
                    </Stack>
                  )}
              </Box>
            )}
          </Box>
          <Box
            px="md"
            py="md"
            style={{
              flexShrink: 0,
              borderTop: '1px solid var(--mantine-color-default-border)',
              backgroundColor: 'var(--mantine-color-body)',
            }}
          >
            <Button variant="light" onClick={goToCatalogFromModal} fullWidth>
              Im Katalog anzeigen
            </Button>
          </Box>
        </Box>
      </Modal>

      <Box maw={1300} mx="auto" w="100%" p="sm">
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
                Scope leads can pin documents for their team, department or company. Pinned
                documents will appear here.
              </Text>
            ) : (
              <Stack gap={4} align="flex-start">
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
                          style={{ flexShrink: 0 }}
                          color="var(--mantine-color-dimmed)"
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
            title={
              draftsData?.total !== undefined ? `My drafts (${draftsData.total})` : 'My drafts'
            }
            titleIcon={<IconPencil size={CARD_TITLE_ICON_SIZE} style={{ flexShrink: 0 }} />}
            viewMoreHref="/personal"
          >
            {draftsPending ? (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            ) : draftDocuments.length === 0 ? (
              <Text size="sm" c="dimmed">
                No drafts.
              </Text>
            ) : (
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
          </SectionCard>

          {hasReviewRights && (
            <SectionCard
              title={
                draftsData !== undefined
                  ? `Pending review (${openDraftRequests.length})`
                  : 'Pending review'
              }
              titleIcon={
                <IconClipboardCheck size={CARD_TITLE_ICON_SIZE} style={{ flexShrink: 0 }} />
              }
              viewMoreHref="/reviews"
            >
              {draftsPending ? (
                <Text size="sm" c="dimmed">
                  Loading…
                </Text>
              ) : openDraftRequests.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No pending reviews.
                </Text>
              ) : (
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
            </SectionCard>
          )}
        </SimpleGrid>
      </Box>
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
