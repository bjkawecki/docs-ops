import { Alert, Box, Button, Card, Group, Loader, Stack, Switch, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import { meQueryKey, useMe } from '../../hooks/useMe';
import type { UserPreferences } from '../../components/system/ThemeFromPreferences';

export function SettingsNotificationsTab() {
  const queryClient = useQueryClient();
  const { data: me, isPending: mePending, isError: meError, error: meErr } = useMe();

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
            <Text size="xs" c="dimmed">
              <strong>Document changes</strong> covers publish, visible updates to published
              documents, archive/trash/restore, and sharing changes (grants).{' '}
              <strong>Draft requests</strong> covers the review workflow. <strong>Reminders</strong>{' '}
              is reserved for future use.
            </Text>
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

      <Button component={Link} to="/notifications" variant="light">
        Open notifications inbox
      </Button>
    </Stack>
  );
}
