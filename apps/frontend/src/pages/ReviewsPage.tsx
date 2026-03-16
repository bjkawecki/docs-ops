import { Button, Group, Loader, Stack, Table, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX } from '@tabler/icons-react';
import { apiFetch } from '../api/client';
import { useMeDrafts, type OpenDraftRequestItem } from '../hooks/useMeDrafts';
import { formatTableDate } from '../lib/formatDate';

function scopeTypeLabel(scopeType: string): string {
  return scopeType.charAt(0).toUpperCase() + scopeType.slice(1);
}

export function ReviewsPage() {
  const queryClient = useQueryClient();
  const [mergingRequestId, setMergingRequestId] = useState<string | null>(null);

  const { data, isPending, error } = useMeDrafts({}, { limit: 100 });
  const openDraftRequests = data?.openDraftRequests ?? [];

  const handleMergeReject = async (
    draftRequestId: string,
    documentId: string,
    action: 'merge' | 'reject'
  ) => {
    setMergingRequestId(draftRequestId);
    try {
      const res = await apiFetch(`/api/v1/draft-requests/${draftRequestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['document-draft-requests', documentId] });
        void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
        if (action === 'merge') {
          void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
          void queryClient.invalidateQueries({ queryKey: ['contexts'] });
          void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
        } else {
          void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
        }
        notifications.show({
          title: action === 'merge' ? 'Merged' : 'Rejected',
          message: `Draft request ${action === 'merge' ? 'merged' : 'rejected'}.`,
          color: 'green',
        });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Error',
          message: body?.error ?? res.statusText,
          color: 'red',
        });
      }
    } finally {
      setMergingRequestId(null);
    }
  };

  return (
    <Stack gap="md" p="md">
      <Text size="xl" fw={600}>
        Pending reviews
      </Text>

      {isPending ? (
        <Group>
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Loading…
          </Text>
        </Group>
      ) : error ? (
        <Text size="sm" c="red">
          Failed to load pending reviews.
        </Text>
      ) : openDraftRequests.length === 0 ? (
        <Text size="sm" c="dimmed">
          No pending reviews.
        </Text>
      ) : (
        <Table withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Document</Table.Th>
              <Table.Th>Scope</Table.Th>
              <Table.Th>Submitted by</Table.Th>
              <Table.Th>Submitted at</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {openDraftRequests.map((dr: OpenDraftRequestItem) => (
              <Table.Tr key={dr.id}>
                <Table.Td>
                  <Text
                    component={Link}
                    to={`/documents/${dr.documentId}`}
                    size="sm"
                    fw={500}
                    style={{ textDecoration: 'none', color: 'var(--mantine-color-anchor)' }}
                  >
                    {dr.documentTitle || dr.documentId}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {scopeTypeLabel(dr.scopeType)}: {dr.scopeName || '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{dr.submittedByName}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatTableDate(dr.submittedAt, { withTime: true })}</Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      color="green"
                      leftSection={<IconCheck size={14} />}
                      loading={mergingRequestId === dr.id}
                      disabled={mergingRequestId != null}
                      onClick={() => void handleMergeReject(dr.id, dr.documentId, 'merge')}
                    >
                      Merge
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      leftSection={<IconX size={14} />}
                      loading={mergingRequestId === dr.id}
                      disabled={mergingRequestId != null}
                      onClick={() => void handleMergeReject(dr.id, dr.documentId, 'reject')}
                    >
                      Reject
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
