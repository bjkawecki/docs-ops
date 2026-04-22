import { ActionIcon, Box, Group, Stack, Text, TextInput } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import { DocopsLogo } from '../../components/appShell/DocopsLogo';
import { useMe } from '../../hooks/useMe';
import { useMeDrafts } from '../../hooks/useMeDrafts';
import { useResolvedColorScheme } from '../../hooks/useResolvedColorScheme';
import { getAggregatedRecentItems } from '../../hooks/useRecentItems';
import {
  DASHBOARD_CARD_LIMIT,
  DASHBOARD_SEARCH_DEBOUNCE_MS,
  DASHBOARD_SEARCH_MIN_CHARS,
  DASHBOARD_SEARCH_MODAL_LIMIT,
} from './homePageConstants';
import type { CatalogResponse, DashboardSearchResponse, PinnedResponse } from './homePageTypes';
import { HomeDashboardSearchModal } from './HomeDashboardSearchModal';
import { HomeDashboardSectionGrid } from './HomeDashboardSectionGrid';
import { HomeSearchIcon } from './HomeSearchIcon';

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

  const handleSearchSubmit = (e: SubmitEvent<HTMLFormElement>) => {
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
            leftSection={<HomeSearchIcon />}
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

      <HomeDashboardSearchModal
        opened={searchModalOpen}
        onClose={closeSearchModal}
        modalSearch={modalSearch}
        setModalSearch={setModalSearch}
        modalSearchInputRef={modalSearchInputRef}
        debouncedModalSearch={debouncedModalSearch}
        searchInputReadyForQuery={searchInputReadyForQuery}
        showSearchSpinner={showSearchSpinner}
        searchDebouncePending={searchDebouncePending}
        dashboardSearchEnabled={dashboardSearchEnabled}
        dashboardSearchError={dashboardSearchError}
        dashboardSearchData={dashboardSearchData}
        goToCatalogFromModal={goToCatalogFromModal}
      />

      <HomeDashboardSectionGrid
        pinnedItems={pinnedItems}
        pinnedPending={pinnedPending}
        pinnedError={pinnedError}
        recentItems={recentItems}
        latestItems={latestItems}
        latestPending={latestPending}
        latestError={latestError}
        draftDocuments={draftDocuments}
        draftsPending={draftsPending}
        draftsTotal={draftsData?.total}
        draftsDataLoaded={draftsData !== undefined}
        openDraftRequests={openDraftRequests}
        hasReviewRights={hasReviewRights}
      />
    </Box>
  );
}
