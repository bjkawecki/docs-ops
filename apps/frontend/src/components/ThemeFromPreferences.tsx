import { type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { appTheme, appCssVariablesResolver } from '../theme';
import { RecentItemsProvider } from '../hooks/useRecentItems';

export type UserPreferences = {
  theme?: 'light' | 'dark' | 'auto';
  sidebarPinned?: boolean;
  locale?: 'en' | 'de';
  recentItemsByScope?: Record<
    string,
    { type: 'process' | 'project' | 'document'; id: string; name?: string }[]
  >;
};

export function ThemeFromPreferences({ children }: { children: ReactNode }) {
  const { data: preferences, isPending } = useQuery({
    queryKey: ['me', 'preferences'],
    queryFn: async (): Promise<UserPreferences> => {
      const res = await apiFetch('/api/v1/me/preferences');
      if (!res.ok) throw new Error('Failed to load preferences');
      return (await res.json()) as UserPreferences;
    },
  });

  if (isPending || preferences === undefined) {
    return null;
  }

  const colorScheme = preferences.theme ?? 'light';
  return (
    <MantineProvider
      theme={appTheme}
      cssVariablesResolver={appCssVariablesResolver}
      defaultColorScheme={colorScheme}
    >
      <RecentItemsProvider>{children}</RecentItemsProvider>
    </MantineProvider>
  );
}
