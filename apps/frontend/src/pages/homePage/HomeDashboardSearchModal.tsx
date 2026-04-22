import {
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconFileText } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { RefObject } from 'react';
import { renderSearchSnippet } from '../../utils/renderSearchSnippet';
import '../../utils/searchSnippetMark.css';
import {
  DASHBOARD_SEARCH_MIN_CHARS,
  DASHBOARD_SEARCH_MODAL_LIMIT,
  SEARCH_HIT_TITLE_ICON,
} from './homePageConstants';
import { dashboardSearchContextSubtitle } from './homePageFormat';
import { HomeDashboardSearchContextIcon } from './HomeDashboardSearchContextIcon';
import { HomeSearchIcon } from './HomeSearchIcon';
import type { DashboardSearchResponse } from './homePageTypes';

export type HomeDashboardSearchModalProps = {
  opened: boolean;
  onClose: () => void;
  modalSearch: string;
  setModalSearch: (v: string) => void;
  modalSearchInputRef: RefObject<HTMLInputElement | null>;
  debouncedModalSearch: string;
  searchInputReadyForQuery: boolean;
  showSearchSpinner: boolean;
  searchDebouncePending: boolean;
  dashboardSearchEnabled: boolean;
  dashboardSearchError: boolean;
  dashboardSearchData: DashboardSearchResponse | undefined;
  goToCatalogFromModal: () => void;
};

export function HomeDashboardSearchModal({
  opened,
  onClose,
  modalSearch,
  setModalSearch,
  modalSearchInputRef,
  debouncedModalSearch,
  searchInputReadyForQuery,
  showSearchSpinner,
  searchDebouncePending,
  dashboardSearchEnabled,
  dashboardSearchError,
  dashboardSearchData,
  goToCatalogFromModal,
}: HomeDashboardSearchModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
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
            leftSection={<HomeSearchIcon />}
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
                                <Link to={`/documents/${doc.id}`} onClick={onClose}>
                                  {doc.title || doc.id}
                                </Link>
                              </Text>
                            </Group>
                            {showMeta && (
                              <Group gap={8} wrap="nowrap" align="center">
                                <HomeDashboardSearchContextIcon contextType={doc.contextType} />
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
  );
}
