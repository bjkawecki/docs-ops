import { Tabs, Title, Text, Stack } from '@mantine/core';
import { SettingsGeneralTab } from './settings/SettingsGeneralTab';
import { SettingsAccountTab } from './settings/SettingsAccountTab';
import { SettingsSecurityTab } from './settings/SettingsSecurityTab';
import { SettingsNotificationsTab } from './settings/SettingsNotificationsTab';

export function SettingsPage() {
  return (
    <>
      <Stack gap="xs" mb="md">
        <Title order={1} size="h2">
          Settings
        </Title>
        <Text size="sm" c="dimmed">
          Profile and appearance.
        </Text>
      </Stack>
      <Tabs
        defaultValue="general"
        variant="default"
        styles={{
          list: { borderBottom: '1px solid var(--mantine-color-default-border)' },
          tab: {
            textTransform: 'uppercase',
            fontWeight: 500,
            fontSize: 'var(--mantine-font-size-sm)',
          },
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="general">General</Tabs.Tab>
          <Tabs.Tab value="account">Account</Tabs.Tab>
          <Tabs.Tab value="security">Security</Tabs.Tab>
          <Tabs.Tab value="notifications">Notifications</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="general" pt="md">
          <SettingsGeneralTab />
        </Tabs.Panel>
        <Tabs.Panel value="account" pt="md">
          <SettingsAccountTab />
        </Tabs.Panel>
        <Tabs.Panel value="security" pt="md">
          <SettingsSecurityTab />
        </Tabs.Panel>
        <Tabs.Panel value="notifications" pt="md">
          <SettingsNotificationsTab />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
