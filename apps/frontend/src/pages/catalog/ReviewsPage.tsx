import { Badge, Box, Group, Pagination, Stack, Table, Tabs, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { useMeReviews, type ReviewSuggestionItem } from '../../hooks/useMeReviews';
import { formatTableDate } from '../../lib/formatDate';

const PAGE_SIZE = 20;

function documentLink(item: ReviewSuggestionItem, editTab: 'draft' | 'suggestions'): string {
  return `/documents/${item.documentId}?mode=edit&tab=${editTab}`;
}

function ReviewsTable({
  items,
  emptyLabel,
  linkTab,
  showAuthor,
}: {
  items: ReviewSuggestionItem[];
  emptyLabel: string;
  linkTab: 'draft' | 'suggestions';
  showAuthor: boolean;
}) {
  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {emptyLabel}
      </Text>
    );
  }

  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Document</Table.Th>
          {showAuthor && <Table.Th>Author</Table.Th>}
          <Table.Th>Scope</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>Submitted</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {items.map((item) => (
          <Table.Tr key={item.suggestionId}>
            <Table.Td>
              <Text
                component={Link}
                to={documentLink(item, linkTab)}
                size="sm"
                fw={500}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {item.documentTitle}
              </Text>
              {item.affectedBlockSummary && (
                <Text size="xs" c="dimmed">
                  {item.affectedBlockSummary}
                </Text>
              )}
            </Table.Td>
            {showAuthor && (
              <Table.Td>
                <Text size="sm">{item.authorName ?? 'Unknown'}</Text>
              </Table.Td>
            )}
            <Table.Td>
              <Text size="sm">{item.scopeName}</Text>
            </Table.Td>
            <Table.Td>
              <Badge size="sm" variant="light">
                {item.status}
              </Badge>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{formatTableDate(item.createdAt)}</Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function ReviewsPage() {
  const [page, setPage] = useState(1);
  const offset = (page - 1) * PAGE_SIZE;
  const { data, isPending, isError } = useMeReviews({ limit: PAGE_SIZE, offset });

  const pending = data?.pendingForReview ?? [];
  const mine = data?.mySuggestions ?? [];
  const totalPages =
    Math.max(
      Math.ceil((data?.totalPendingForReview ?? 0) / PAGE_SIZE),
      Math.ceil((data?.totalMySuggestions ?? 0) / PAGE_SIZE),
      1
    ) || 1;

  return (
    <Box>
      <PageHeader
        title="Reviews"
        description="Pending suggestions for scope leads and your own submitted suggestions."
      />
      <Stack gap="md">
        {isError && (
          <Text size="sm" c="red">
            Could not load reviews.
          </Text>
        )}
        <Tabs defaultValue="pending">
          <Tabs.List>
            <Tabs.Tab value="pending">
              Pending for review
              {data != null && data.totalPendingForReview > 0
                ? ` (${data.totalPendingForReview})`
                : ''}
            </Tabs.Tab>
            <Tabs.Tab value="mine">
              My suggestions
              {data != null && data.totalMySuggestions > 0 ? ` (${data.totalMySuggestions})` : ''}
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="pending" pt="md">
            {isPending ? (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            ) : (
              <ReviewsTable
                items={pending}
                emptyLabel="No pending suggestions in your scopes."
                linkTab="draft"
                showAuthor
              />
            )}
          </Tabs.Panel>
          <Tabs.Panel value="mine" pt="md">
            {isPending ? (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            ) : (
              <ReviewsTable
                items={mine}
                emptyLabel="You have no pending suggestions."
                linkTab="suggestions"
                showAuthor={false}
              />
            )}
          </Tabs.Panel>
        </Tabs>
        {!isPending && totalPages > 1 && (
          <Group justify="center">
            <Pagination total={totalPages} value={page} onChange={setPage} />
          </Group>
        )}
      </Stack>
    </Box>
  );
}
