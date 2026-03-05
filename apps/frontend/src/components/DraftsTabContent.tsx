import { Badge, Card, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import {
  useMeDrafts,
  type MeDraftsScopeParams,
  type DraftDocumentItem,
  type OpenDraftRequestItem,
} from '../hooks/useMeDrafts';

export interface DraftsTabContentProps {
  scopeParams: MeDraftsScopeParams;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

function UnpublishedList({ items }: { items: DraftDocumentItem[] }) {
  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No drafts
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      {items.map((d) => (
        <Link
          key={d.id}
          to={`/documents/${d.id}`}
          style={{ fontSize: 'var(--mantine-font-size-sm)' }}
        >
          {d.title || d.id}
        </Link>
      ))}
    </Stack>
  );
}

function PendingReviewList({ items }: { items: OpenDraftRequestItem[] }) {
  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No open draft requests
      </Text>
    );
  }
  return (
    <Stack gap="xs">
      {items.map((dr) => (
        <Card
          key={dr.id}
          withBorder
          padding="sm"
          component={Link}
          to={`/documents/${dr.documentId}`}
        >
          <Text fw={500} size="sm">
            {dr.documentTitle || dr.documentId}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {dr.submittedByName} · {new Date(dr.submittedAt).toLocaleDateString()}
          </Text>
          <Badge size="xs" variant="light" mt="xs">
            Open
          </Badge>
        </Card>
      ))}
    </Stack>
  );
}

export function DraftsTabContent({
  scopeParams,
  limit = 50,
  offset = 0,
  enabled = true,
}: DraftsTabContentProps) {
  const { data, isPending } = useMeDrafts(scopeParams, { limit, offset, enabled });

  if (isPending) {
    return (
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Loading drafts…
        </Text>
      </Card>
    );
  }

  const draftDocuments = data?.draftDocuments ?? [];
  const openDraftRequests = data?.openDraftRequests ?? [];

  return (
    <Stack gap="md">
      <Card withBorder padding="md">
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Unpublished documents
          </Text>
          <UnpublishedList items={draftDocuments} />
        </Stack>
      </Card>
      <Card withBorder padding="md">
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Pending review
          </Text>
          <PendingReviewList items={openDraftRequests} />
        </Stack>
      </Card>
    </Stack>
  );
}
