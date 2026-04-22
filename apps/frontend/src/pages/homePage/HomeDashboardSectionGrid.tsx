import { Badge, Box, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import {
  IconCalendar,
  IconClipboardCheck,
  IconClock,
  IconFileText,
  IconPin,
  IconPencil,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { RecentItemsCard, SectionCard } from '../../components/contexts';
import type { DraftDocumentItem, OpenDraftRequestItem } from '../../hooks/useMeDrafts';
import type { RecentItem } from '../../hooks/useRecentItems';
import {
  CARD_TITLE_ICON_SIZE,
  DASHBOARD_ITEM_GAP,
  ROW_PADDING,
  SCOPE_ICON_SIZE,
  TITLE_COLUMN_WIDTH,
} from './homePageConstants';
import { formatDate, scopeTypeLabel } from './homePageFormat';
import { HomeScopeSuffix } from './HomeScopeSuffix';
import type { CatalogDocument, PinnedItem } from './homePageTypes';

export type HomeDashboardSectionGridProps = {
  pinnedItems: PinnedItem[];
  pinnedPending: boolean;
  pinnedError: boolean;
  recentItems: RecentItem[];
  latestItems: CatalogDocument[];
  latestPending: boolean;
  latestError: boolean;
  draftDocuments: DraftDocumentItem[];
  draftsPending: boolean;
  /** When defined, "My drafts" title includes total count (matches `draftsData?.total`). */
  draftsTotal: number | undefined;
  /** When true, "Pending review" title includes open request count (matches `draftsData !== undefined`). */
  draftsDataLoaded: boolean;
  openDraftRequests: OpenDraftRequestItem[];
  hasReviewRights: boolean;
};

export function HomeDashboardSectionGrid({
  pinnedItems,
  pinnedPending,
  pinnedError,
  recentItems,
  latestItems,
  latestPending,
  latestError,
  draftDocuments,
  draftsPending,
  draftsTotal,
  draftsDataLoaded,
  openDraftRequests,
  hasReviewRights,
}: HomeDashboardSectionGridProps) {
  return (
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
              Scope leads can pin documents for their team, department or company. Pinned documents
              will appear here.
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
                  <HomeScopeSuffix
                    key={`${doc.id}-s`}
                    scopeType={scopeType}
                    scopeName={scopeName}
                  />,
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
          title={draftsTotal !== undefined ? `My drafts (${draftsTotal})` : 'My drafts'}
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
                  <HomeScopeSuffix
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
              draftsDataLoaded ? `Pending review (${openDraftRequests.length})` : 'Pending review'
            }
            titleIcon={<IconClipboardCheck size={CARD_TITLE_ICON_SIZE} style={{ flexShrink: 0 }} />}
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
                    <HomeScopeSuffix
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
  );
}
