import { Box, Card, Group, Stack, Text } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { ViewMoreButton } from './contexts/cardShared';
import {
  useMeDrafts,
  type MeDraftsScopeParams,
  type OpenDraftRequestItem,
} from '../hooks/useMeDrafts';

export interface DraftsCardProps {
  scopeParams: MeDraftsScopeParams;
  limit?: number;
  enabled?: boolean;
  /** Callback when "View more" is clicked (e.g. setActiveTab('drafts')). */
  onViewMore?: () => void;
}

function DraftPreviewLinks({
  items,
  to,
}: {
  items: { id: string; title?: string }[];
  to: (id: string) => string;
}) {
  if (items.length === 0) return null;
  return (
    <Stack gap={4} align="flex-start">
      {items.map((d) => (
        <Link key={d.id} to={to(d.id)} style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
          {d.title || d.id}
        </Link>
      ))}
    </Stack>
  );
}

export function DraftsCard({
  scopeParams,
  limit = 5,
  enabled = true,
  onViewMore,
}: DraftsCardProps) {
  const { data, isPending } = useMeDrafts(scopeParams, { limit, offset: 0, enabled });

  const draftDocuments = (data?.draftDocuments ?? []).slice(0, 3);
  const openDraftRequests = (data?.openDraftRequests ?? []).slice(0, 2);

  const hasDrafts = draftDocuments.length > 0 || openDraftRequests.length > 0;

  return (
    <Card withBorder padding="md" h="100%">
      <Stack gap="xs" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
        <Box style={{ flex: 1, minHeight: 0 }}>
          <Stack gap="md">
            <Group gap="xs" wrap="nowrap">
              <IconPencil size={18} style={{ flexShrink: 0 }} />
              <Text fw={600} size="md">
                Drafts
              </Text>
            </Group>
            {isPending ? (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            ) : !hasDrafts ? (
              <Text size="sm" c="dimmed">
                No drafts or pending review.
              </Text>
            ) : (
              <>
                {draftDocuments.length > 0 && (
                  <>
                    <Text size="xs" c="dimmed" fw={500}>
                      Unpublished
                    </Text>
                    <DraftPreviewLinks items={draftDocuments} to={(id) => `/documents/${id}`} />
                  </>
                )}
                {openDraftRequests.length > 0 && (
                  <>
                    <Text size="xs" c="dimmed" fw={500} mt={draftDocuments.length > 0 ? 'xs' : 0}>
                      Pending review
                    </Text>
                    <Stack gap={4} align="flex-start">
                      {openDraftRequests.map((dr: OpenDraftRequestItem) => (
                        <Link
                          key={dr.id}
                          to={`/documents/${dr.documentId}`}
                          style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                        >
                          {dr.documentTitle || dr.documentId}
                        </Link>
                      ))}
                    </Stack>
                  </>
                )}
              </>
            )}
          </Stack>
        </Box>
        {onViewMore && <ViewMoreButton onClick={onViewMore} />}
      </Stack>
    </Card>
  );
}
