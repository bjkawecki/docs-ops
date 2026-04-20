import { Box, Tabs } from '@mantine/core';
import { useCallback, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { SettingsGeneralTab } from './settings/SettingsGeneralTab';
import { SettingsAccountTab } from './settings/SettingsAccountTab';
import { SettingsSecurityTab } from './settings/SettingsSecurityTab';
import { SettingsNotificationsTab } from './settings/SettingsNotificationsTab';
import { SettingsStorageTab } from './settings/SettingsStorageTab';

type SettingsTabValue = 'general' | 'account' | 'security' | 'storage' | 'notifications';

const SETTINGS_TAB_STORAGE_KEY = 'docsops-settings-active-tab';
const DEFAULT_SETTINGS_TAB: SettingsTabValue = 'general';
const SETTINGS_TAB_VALUES: ReadonlyArray<SettingsTabValue> = [
  'general',
  'account',
  'security',
  'storage',
  'notifications',
];

function readInitialSettingsTab(): SettingsTabValue {
  try {
    const value = window.localStorage.getItem(SETTINGS_TAB_STORAGE_KEY);
    if (value == null) return DEFAULT_SETTINGS_TAB;
    return SETTINGS_TAB_VALUES.includes(value as SettingsTabValue)
      ? (value as SettingsTabValue)
      : DEFAULT_SETTINGS_TAB;
  } catch {
    return DEFAULT_SETTINGS_TAB;
  }
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTabValue>(() => readInitialSettingsTab());

  const handleTabChange = useCallback((nextValue: string | null) => {
    const nextTab =
      nextValue != null && SETTINGS_TAB_VALUES.includes(nextValue as SettingsTabValue)
        ? (nextValue as SettingsTabValue)
        : DEFAULT_SETTINGS_TAB;
    setActiveTab(nextTab);
    try {
      window.localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, nextTab);
    } catch {
      // Ignore storage errors (e.g. private mode restrictions).
    }
  }, []);

  return (
    <Box>
      <PageHeader title="Settings" description="Profile and appearance." />
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
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
          <Tabs.Tab value="storage">Storage</Tabs.Tab>
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
        <Tabs.Panel value="storage" pt="md">
          <SettingsStorageTab />
        </Tabs.Panel>
        <Tabs.Panel value="notifications" pt="md">
          <SettingsNotificationsTab />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
