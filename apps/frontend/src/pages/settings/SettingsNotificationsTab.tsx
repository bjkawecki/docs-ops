import { Box, Card, Text } from '@mantine/core';

export function SettingsNotificationsTab() {
  return (
    <Card withBorder padding={0}>
      <Box py="xs" px="md" bg="var(--mantine-color-default-hover)">
        <Text fw={600} size="md">
          Notifications
        </Text>
      </Box>
      <Box p="md">
        <Text size="sm" c="dimmed">
          Notification preferences will be available here. You will be able to enable e-mail for
          document changes, PRs, and reminders.
        </Text>
      </Box>
    </Card>
  );
}
