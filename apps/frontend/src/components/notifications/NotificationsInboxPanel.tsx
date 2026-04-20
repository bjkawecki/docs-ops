import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  Pagination,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconCheck } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import { useMe } from '../../hooks/useMe';

export type NotificationItem = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  /** Current document title when still in DB; null if missing or no document in payload. */
  documentTitle?: string | null;
};

type NotificationsResponse = {
  items: NotificationItem[];
  total: number;
  limit: number;
  offset: number;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_LIMIT = 20;

export const ME_NOTIFICATION_CATEGORIES = ['all', 'documents', 'reviews', 'system', 'org'] as const;
export type MeNotificationCategory = (typeof ME_NOTIFICATION_CATEGORIES)[number];

export function parseMeNotificationCategory(raw: string | null): MeNotificationCategory {
  if (raw != null && ME_NOTIFICATION_CATEGORIES.includes(raw as MeNotificationCategory)) {
    return raw as MeNotificationCategory;
  }
  return 'all';
}

/** `unreadOnly` query param for `/notifications` (coerced booleans are unsafe for `"false"`). */
export function parseMeNotificationUnreadOnly(raw: string | null): boolean {
  if (raw == null || raw === '') return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export function meNotificationsListQueryKey(
  limit: number,
  offset: number,
  unreadOnly: boolean,
  category: MeNotificationCategory
): readonly ['me', 'notifications', number, number, boolean, MeNotificationCategory] {
  return ['me', 'notifications', limit, offset, unreadOnly, category];
}

function eventHeadline(eventType: string): string {
  const labels: Record<string, string> = {
    'document-created': 'Document created',
    'document-updated': 'Document updated',
    'document-deleted': 'Document moved to trash',
    'document-published': 'Document published',
    'document-archived': 'Document archived',
    'document-restored': 'Document restored',
    'document-grants-changed': 'Document access changed',
    'document-comment-created': 'New comment on document',
    'draft-request-submitted': 'Review request submitted',
    'draft-request-merged': 'Review request merged',
    'draft-request-rejected': 'Review request rejected',
  };
  return labels[eventType] ?? eventType.replace(/-/g, ' ');
}

function payloadDocumentId(payload: Record<string, unknown>): string | null {
  return typeof payload.documentId === 'string' ? payload.documentId : null;
}

function payloadDraftRequestId(payload: Record<string, unknown>): string | null {
  return typeof payload.draftRequestId === 'string' ? payload.draftRequestId : null;
}

function secondaryDetail(eventType: string, payload: Record<string, unknown>): string | null {
  if (eventType === 'document-comment-created') {
    const preview = typeof payload.commentPreview === 'string' ? payload.commentPreview.trim() : '';
    if (preview !== '') return preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
    return 'Someone commented on a document you can read.';
  }
  const draftId = payloadDraftRequestId(payload);
  if (draftId == null) return null;
  if (eventType === 'draft-request-submitted') return 'A review request is open for this document.';
  if (eventType === 'draft-request-merged')
    return 'Your proposed changes were merged into the published version.';
  if (eventType === 'draft-request-rejected') return 'Your review request was rejected.';
  return 'Related to a review request.';
}

function documentDisplayTitle(item: NotificationItem): string {
  const docId = payloadDocumentId(item.payload);
  if (docId == null) return 'Activity';
  if (item.documentTitle != null && item.documentTitle.trim() !== '') return item.documentTitle;
  return 'Untitled document';
}

type NotificationsInboxPanelProps = {
  /** Card header title (default: activity list wording). */
  cardTitle?: string;
  /** Inbox filter; must match GET /me/notifications `category`. */
  category: MeNotificationCategory;
  /** Unread-only list filter (e.g. synced with URL on `/notifications`). */
  unreadOnly: boolean;
  onUnreadOnlyChange: (unreadOnly: boolean) => void;
  /** When true, no outer Card (for use inside Context-style `Card` on the page). */
  embedded?: boolean;
};

export function NotificationsInboxPanel({
  cardTitle = 'Inbox',
  category,
  unreadOnly,
  onUnreadOnlyChange,
  embedded = false,
}: NotificationsInboxPanelProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);
  const [page, setPage] = useState(1);
  const offset = (page - 1) * limit;

  useEffect(() => {
    setPage(1);
  }, [category, unreadOnly]);

  const notificationsUrl = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('limit', String(limit));
    sp.set('offset', String(offset));
    sp.set('unreadOnly', unreadOnly ? 'true' : 'false');
    if (category !== 'all') sp.set('category', category);
    return `/api/v1/me/notifications?${sp.toString()}`;
  }, [limit, offset, unreadOnly, category]);

  const notificationsQuery = useQuery({
    queryKey: meNotificationsListQueryKey(limit, offset, unreadOnly, category),
    queryFn: async (): Promise<NotificationsResponse> => {
      const res = await apiFetch(notificationsUrl);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load notifications');
      }
      const data = (await res.json()) as NotificationsResponse;
      return {
        ...data,
        items: data.items.map((item) => ({
          ...item,
          payload:
            typeof item.payload === 'object' &&
            item.payload !== null &&
            !Array.isArray(item.payload)
              ? item.payload
              : {},
        })),
      };
    },
    enabled: !!me,
  });

  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await apiFetch(`/api/v1/me/notifications/${notificationId}/read`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to mark notification as read');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] });
    },
    onError: (error: Error) => {
      notifications.show({ title: 'Update failed', message: error.message, color: 'red' });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/me/notifications/read-all', { method: 'PATCH' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to mark all notifications as read');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] });
      notifications.show({
        title: 'Notifications updated',
        message: 'All notifications were marked as read.',
        color: 'green',
      });
    },
    onError: (error: Error) => {
      notifications.show({ title: 'Update failed', message: error.message, color: 'red' });
    },
  });

  const notificationItems = notificationsQuery.data?.items ?? [];
  const totalNotifications = notificationsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalNotifications / limit));

  /** Filter row aligned like `/catalog`: controls left, total + per page pushed right. */
  const filtersRow = (
    <Group gap="md" wrap="wrap" align="flex-end" w="100%">
      <Switch
        size="sm"
        label="Unread only"
        checked={unreadOnly}
        onChange={(event) => {
          onUnreadOnlyChange(event.currentTarget.checked);
        }}
      />
      <Text size="sm" c="dimmed" style={{ marginLeft: 'auto' }}>
        {notificationsQuery.data != null
          ? `${totalNotifications} notification${totalNotifications !== 1 ? 's' : ''}`
          : '—'}
      </Text>
      <Select
        label="Per page"
        data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
        value={String(limit)}
        onChange={(v) => {
          if (!v) return;
          setLimit(parseInt(v, 10));
          setPage(1);
        }}
        style={{ width: 90 }}
      />
    </Group>
  );

  const toolbar = !embedded ? (
    <Stack gap="md" w="100%">
      <Stack gap={2}>
        <Text fw={600} size="lg">
          {cardTitle}
        </Text>
        <Text size="sm" c="dimmed">
          Open a row to go to the document.
        </Text>
      </Stack>
      {filtersRow}
    </Stack>
  ) : (
    filtersRow
  );

  const markAllRow = (
    <Group justify="flex-end" wrap="wrap">
      <Button
        size="sm"
        variant="light"
        onClick={() => markAllAsRead.mutate()}
        disabled={markAllAsRead.isPending || notificationItems.length === 0}
      >
        Mark all as read
      </Button>
    </Group>
  );

  const listContent = (
    <Stack gap="md">
      {markAllRow}
      <Box>
        {notificationsQuery.isPending && <Loader size="sm" />}
        {notificationsQuery.isError && (
          <Alert color="red" mt="sm">
            {notificationsQuery.error instanceof Error
              ? notificationsQuery.error.message
              : 'Failed to load notifications'}
          </Alert>
        )}
        {!notificationsQuery.isPending &&
          !notificationsQuery.isError &&
          notificationItems.length === 0 && (
            <Stack align="center" gap="xs" py="xl" px="md">
              <Text fw={500} c="dimmed">
                No notifications
              </Text>
              <Text size="sm" c="dimmed" ta="center" maw={360}>
                When documents change or review requests update, they will show up here.
              </Text>
            </Stack>
          )}
        {!notificationsQuery.isPending &&
          !notificationsQuery.isError &&
          notificationItems.length > 0 && (
            <Box style={{ overflowX: 'auto' }}>
              <Table
                highlightOnHover
                verticalSpacing="sm"
                withTableBorder
                style={{ minWidth: 640 }}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: '22%' }}>Event</Table.Th>
                    <Table.Th>Document</Table.Th>
                    <Table.Th style={{ width: '18%', whiteSpace: 'nowrap' }}>When</Table.Th>
                    <Table.Th style={{ width: 52 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {notificationItems.map((item) => {
                    const docId = payloadDocumentId(item.payload);
                    const docHref = docId != null ? `/documents/${docId}` : null;
                    const detail = secondaryDetail(item.eventType, item.payload);
                    const unread = item.readAt == null;
                    return (
                      <Table.Tr
                        key={item.id}
                        onClick={() => {
                          if (docHref != null) void navigate(docHref);
                        }}
                        style={{
                          cursor: docHref != null ? 'pointer' : 'default',
                          borderLeft: unread
                            ? '3px solid var(--mantine-color-blue-filled)'
                            : '3px solid transparent',
                        }}
                      >
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <Text size="xs" c="dimmed" tt="uppercase" fw={600} lineClamp={2}>
                              {eventHeadline(item.eventType)}
                            </Text>
                            {!unread && (
                              <Badge size="xs" variant="dot" color="gray">
                                Read
                              </Badge>
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={4}>
                            {docHref != null ? (
                              <Anchor
                                component={Link}
                                to={docHref}
                                fw={600}
                                size="sm"
                                lineClamp={2}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {documentDisplayTitle(item)}
                              </Anchor>
                            ) : (
                              <Text fw={600} size="sm" lineClamp={2}>
                                {documentDisplayTitle(item)}
                              </Text>
                            )}
                            {detail != null && (
                              <Text size="sm" c="dimmed" lineClamp={2}>
                                {detail}
                              </Text>
                            )}
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {new Date(item.createdAt).toLocaleString()}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Tooltip label="Mark as read">
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="md"
                              radius="md"
                              aria-label="Mark as read"
                              disabled={!unread || markAsRead.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead.mutate(item.id);
                              }}
                            >
                              <IconCheck size={18} />
                            </ActionIcon>
                          </Tooltip>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Box>
          )}
        {!notificationsQuery.isPending && !notificationsQuery.isError && totalPages > 1 && (
          <Group justify="flex-end" pt="lg">
            <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
          </Group>
        )}
      </Box>
    </Stack>
  );

  return (
    <Stack gap="md">
      {toolbar}
      <Card
        withBorder
        radius="md"
        padding={embedded ? 'md' : 'lg'}
        shadow={embedded ? undefined : 'sm'}
        style={embedded ? { flex: 1, minWidth: 0, width: '100%' } : undefined}
      >
        {listContent}
      </Card>
    </Stack>
  );
}
