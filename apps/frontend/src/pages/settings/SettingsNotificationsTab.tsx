import {
  Alert,
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
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';
import { meQueryKey, useMe } from '../../hooks/useMe';
import type { UserPreferences } from '../../components/ThemeFromPreferences';
import { useMemo, useState } from 'react';

type NotificationItem = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

type NotificationsResponse = {
  items: NotificationItem[];
  total: number;
  limit: number;
  offset: number;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_LIMIT = 20;

function mapEventTypeToLabel(eventType: string): string {
  const labels: Record<string, string> = {
    'document-created': 'Dokument erstellt',
    'document-updated': 'Dokument aktualisiert',
    'document-deleted': 'Dokument geloescht',
    'document-published': 'Dokument veroeffentlicht',
    'document-archived': 'Dokument archiviert',
    'document-restored': 'Dokument wiederhergestellt',
    'draft-request-submitted': 'Review-Anfrage eingereicht',
    'draft-request-merged': 'Review-Anfrage gemerged',
    'draft-request-rejected': 'Review-Anfrage abgelehnt',
  };
  return labels[eventType] ?? eventType.replace(/-/g, ' ');
}

function describeNotificationPayload(payload: Record<string, unknown>): string | null {
  const docId = typeof payload.documentId === 'string' ? payload.documentId : null;
  const draftRequestId = typeof payload.draftRequestId === 'string' ? payload.draftRequestId : null;
  if (docId && draftRequestId) return `Dokument ${docId}, Anfrage ${draftRequestId}`;
  if (docId) return `Dokument ${docId}`;
  if (draftRequestId) return `Anfrage ${draftRequestId}`;
  return null;
}

export function SettingsNotificationsTab() {
  const queryClient = useQueryClient();
  const { data: me, isPending: mePending, isError: meError, error: meErr } = useMe();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);
  const [page, setPage] = useState(1);
  const offset = (page - 1) * limit;
  const notificationsUrl = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('limit', String(limit));
    sp.set('offset', String(offset));
    sp.set('unreadOnly', unreadOnly ? 'true' : 'false');
    return `/api/v1/me/notifications?${sp.toString()}`;
  }, [limit, offset, unreadOnly]);

  const notificationsQuery = useQuery({
    queryKey: ['me', 'notifications', limit, offset, unreadOnly],
    queryFn: async (): Promise<NotificationsResponse> => {
      const res = await apiFetch(notificationsUrl);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load notifications');
      }
      return (await res.json()) as NotificationsResponse;
    },
    enabled: !!me,
  });

  const patchPreferences = useMutation({
    mutationFn: async (body: Partial<UserPreferences>) => {
      const res = await apiFetch('/api/v1/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to save preferences');
      }
      return (await res.json()) as UserPreferences;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
      notifications.show({
        title: 'Notifications updated',
        message: 'Your notification preferences were saved.',
        color: 'green',
      });
    },
    onError: (error: Error) => {
      notifications.show({ title: 'Save failed', message: error.message, color: 'red' });
    },
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

  const updateNotificationSetting = (
    channel: 'inApp' | 'email',
    key: 'documentChanges' | 'draftRequests' | 'reminders',
    value: boolean
  ) => {
    patchPreferences.mutate({
      notificationSettings: {
        [channel]: {
          [key]: value,
        },
      },
    });
  };

  if (mePending) return <Loader size="sm" />;
  if (meError || !me) {
    return (
      <Alert color="red" title="Error">
        {meErr instanceof Error ? meErr.message : 'Failed to load settings'}
      </Alert>
    );
  }

  const prefs = me.preferences.notificationSettings ?? {};
  const inApp = prefs.inApp ?? {};
  const email = prefs.email ?? {};
  const notificationItems = notificationsQuery.data?.items ?? [];
  const totalNotifications = notificationsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalNotifications / limit));

  return (
    <Stack gap="md">
      <Card withBorder padding={0}>
        <Box py="xs" px="md" bg="var(--mantine-color-default-hover)">
          <Text fw={600} size="md">
            Notification preferences
          </Text>
        </Box>
        <Box p="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                In-app: document changes
              </Text>
              <Switch
                checked={inApp.documentChanges ?? true}
                onChange={(event) =>
                  updateNotificationSetting('inApp', 'documentChanges', event.currentTarget.checked)
                }
                disabled={patchPreferences.isPending}
              />
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                In-app: draft requests
              </Text>
              <Switch
                checked={inApp.draftRequests ?? true}
                onChange={(event) =>
                  updateNotificationSetting('inApp', 'draftRequests', event.currentTarget.checked)
                }
                disabled={patchPreferences.isPending}
              />
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                In-app: reminders
              </Text>
              <Switch
                checked={inApp.reminders ?? true}
                onChange={(event) =>
                  updateNotificationSetting('inApp', 'reminders', event.currentTarget.checked)
                }
                disabled={patchPreferences.isPending}
              />
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Email: document changes
              </Text>
              <Switch
                checked={email.documentChanges ?? false}
                onChange={(event) =>
                  updateNotificationSetting('email', 'documentChanges', event.currentTarget.checked)
                }
                disabled={patchPreferences.isPending}
              />
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Email: draft requests
              </Text>
              <Switch
                checked={email.draftRequests ?? false}
                onChange={(event) =>
                  updateNotificationSetting('email', 'draftRequests', event.currentTarget.checked)
                }
                disabled={patchPreferences.isPending}
              />
            </Group>
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Email: reminders
              </Text>
              <Switch
                checked={email.reminders ?? false}
                onChange={(event) =>
                  updateNotificationSetting('email', 'reminders', event.currentTarget.checked)
                }
                disabled={patchPreferences.isPending}
              />
            </Group>
          </Stack>
        </Box>
      </Card>

      <Card withBorder padding={0}>
        <Box py="xs" px="md" bg="var(--mantine-color-default-hover)">
          <Group justify="space-between" align="center">
            <Text fw={600} size="md">
              Recent notifications
            </Text>
            <Group gap="xs" align="center">
              <Switch
                label="Unread only"
                checked={unreadOnly}
                onChange={(event) => {
                  setUnreadOnly(event.currentTarget.checked);
                  setPage(1);
                }}
              />
              <Select
                size="xs"
                label="Per page"
                data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
                value={String(limit)}
                onChange={(value) => {
                  const next = Number(value ?? DEFAULT_LIMIT);
                  setLimit(next);
                  setPage(1);
                }}
                style={{ width: 90 }}
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
        </Box>
        <Box p="md">
          {notificationsQuery.isPending && <Loader size="sm" />}
          {notificationsQuery.isError && (
            <Alert color="red">
              {notificationsQuery.error instanceof Error
                ? notificationsQuery.error.message
                : 'Failed to load notifications'}
            </Alert>
          )}
          {!notificationsQuery.isPending && !notificationsQuery.isError && (
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Event</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {notificationItems.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text size="sm" c="dimmed">
                        No notifications yet.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  notificationItems.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {mapEventTypeToLabel(item.eventType)}
                        </Text>
                        {describeNotificationPayload(item.payload) && (
                          <Text size="xs" c="dimmed">
                            {describeNotificationPayload(item.payload)}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Badge color={item.readAt ? 'gray' : 'blue'} variant="light">
                          {item.readAt ? 'Read' : 'Unread'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{new Date(item.createdAt).toLocaleString()}</Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="light"
                          disabled={item.readAt != null || markAsRead.isPending}
                          onClick={() => markAsRead.mutate(item.id)}
                        >
                          Mark as read
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          )}
          {!notificationsQuery.isPending && !notificationsQuery.isError && totalPages > 1 && (
            <Group justify="flex-end" mt="md">
              <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
            </Group>
          )}
        </Box>
      </Card>
    </Stack>
  );
}
