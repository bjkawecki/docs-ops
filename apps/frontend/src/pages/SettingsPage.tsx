import { Box, Tabs } from '@mantine/core';
import { PageHeader } from '../components/PageHeader';
import { SettingsGeneralTab } from './settings/SettingsGeneralTab';
import { SettingsAccountTab } from './settings/SettingsAccountTab';
import { SettingsSecurityTab } from './settings/SettingsSecurityTab';
import { SettingsNotificationsTab } from './settings/SettingsNotificationsTab';

export function SettingsPage() {
  return (
    <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <PageHeader title="Settings" description="Profile and appearance." />
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
    </Box>
  );
}
