import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconBell, IconCheck, IconFileText } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  return 'Document (title unavailable)';
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

  const body = (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <div>
          <Text fw={600} size="lg">
            {cardTitle}
          </Text>
          <Text size="sm" c="dimmed">
            Document and review activity. Open an item to go to the document.
          </Text>
        </div>
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Switch
            size="sm"
            label="Unread only"
            checked={unreadOnly}
            onChange={(event) => {
              onUnreadOnlyChange(event.currentTarget.checked);
            }}
          />
          <Select
            size="xs"
            label="Per page"
            w={100}
            data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            value={String(limit)}
            onChange={(value) => {
              const next = Number(value ?? DEFAULT_LIMIT);
              setLimit(next);
              setPage(1);
            }}
          />
          <Button
            size="xs"
            variant="light"
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
          >
            Mark all as read
          </Button>
        </Group>
      </Group>

      <Divider />

      {notificationsQuery.isPending && <Loader size="sm" />}
      {notificationsQuery.isError && (
        <Alert color="red">
          {notificationsQuery.error instanceof Error
            ? notificationsQuery.error.message
            : 'Failed to load notifications'}
        </Alert>
      )}
      {!notificationsQuery.isPending &&
        !notificationsQuery.isError &&
        notificationItems.length === 0 && (
          <Paper withBorder p="xl" radius="md" bg="var(--mantine-color-default-hover)">
            <Stack align="center" gap="sm">
              <ThemeIcon size="xl" radius="md" variant="light" color="gray">
                <IconBell size={22} stroke={1.5} />
              </ThemeIcon>
              <Text fw={500}>No notifications</Text>
              <Text size="sm" c="dimmed" ta="center" maw={360}>
                When documents change or review requests update, entries will appear here.
              </Text>
            </Stack>
          </Paper>
        )}
      {!notificationsQuery.isPending &&
        !notificationsQuery.isError &&
        notificationItems.length > 0 && (
          <Stack gap={0}>
            {notificationItems.map((item, index) => {
              const docId = payloadDocumentId(item.payload);
              const docHref = docId != null ? `/documents/${docId}` : null;
              const detail = secondaryDetail(item.eventType, item.payload);
              const unread = item.readAt == null;
              return (
                <Box key={item.id}>
                  {index > 0 && <Divider my="sm" />}
                  <Paper
                    p="md"
                    radius="md"
                    withBorder
                    style={{
                      borderColor: unread ? 'var(--mantine-color-blue-light-color)' : undefined,
                      backgroundColor: unread
                        ? 'var(--mantine-color-blue-light)'
                        : 'var(--mantine-color-body)',
                    }}
                  >
                    <Group align="flex-start" wrap="nowrap" gap="md">
                      <ThemeIcon
                        size={42}
                        radius="md"
                        variant={unread ? 'light' : 'default'}
                        color={unread ? 'blue' : 'gray'}
                      >
                        <IconFileText size={22} stroke={1.5} />
                      </ThemeIcon>
                      <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                        <Group gap="xs" wrap="wrap">
                          <Badge size="sm" variant="dot" color={unread ? 'blue' : 'gray'}>
                            {eventHeadline(item.eventType)}
                          </Badge>
                          {!unread && (
                            <Badge size="sm" variant="light" color="gray">
                              Read
                            </Badge>
                          )}
                        </Group>
                        {docHref != null ? (
                          <Anchor component={Link} to={docHref} fw={600} size="md" lineClamp={2}>
                            {documentDisplayTitle(item)}
                          </Anchor>
                        ) : (
                          <Text fw={600} size="md">
                            {documentDisplayTitle(item)}
                          </Text>
                        )}
                        {detail != null && (
                          <Text size="sm" c="dimmed" lineClamp={2}>
                            {detail}
                          </Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {new Date(item.createdAt).toLocaleString()}
                        </Text>
                      </Stack>
                      <Tooltip label="Mark as read">
                        <ActionIcon
                          variant="light"
                          color="gray"
                          size="lg"
                          radius="md"
                          aria-label="Mark as read"
                          disabled={!unread || markAsRead.isPending}
                          onClick={() => markAsRead.mutate(item.id)}
                        >
                          <IconCheck size={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Paper>
                </Box>
              );
            })}
          </Stack>
        )}
      {!notificationsQuery.isPending && !notificationsQuery.isError && totalPages > 1 && (
        <Group justify="center" pt="sm">
          <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}
    </Stack>
  );

  if (embedded) {
    return body;
  }

  return (
    <Card withBorder padding="lg" radius="md" shadow="sm">
      {body}
    </Card>
  );
}
