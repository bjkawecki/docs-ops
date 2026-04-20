import { type ReactNode, useEffect, useMemo } from 'react';
import { MantineProvider, useMantineColorScheme } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { createAppTheme, type PrimaryColorPreset, type TextSizePreference } from '../theme';
import { RecentItemsProvider } from '../hooks/useRecentItems';

export type UserPreferences = {
  theme?: 'light' | 'dark' | 'auto';
  sidebarPinned?: boolean;
  locale?: 'en' | 'de';
  primaryColor?: PrimaryColorPreset;
  textSize?: TextSizePreference;
  recentItemsByScope?: Record<
    string,
    { type: 'process' | 'project' | 'document'; id: string; name?: string }[]
  >;
  notificationSettings?: {
    inApp?: {
      documentChanges?: boolean;
      draftRequests?: boolean;
      reminders?: boolean;
    };
    email?: {
      documentChanges?: boolean;
      draftRequests?: boolean;
      reminders?: boolean;
    };
  };
};

/** Syncs Mantine color scheme to the stored preference when preferences load or theme changes. */
function SyncColorScheme({ preferredScheme }: { preferredScheme: 'light' | 'dark' | 'auto' }) {
  const { setColorScheme } = useMantineColorScheme();
  useEffect(() => {
    setColorScheme(preferredScheme);
  }, [preferredScheme, setColorScheme]);
  return null;
}

export function ThemeFromPreferences({ children }: { children: ReactNode }) {
  const { data: preferences, isPending } = useQuery({
    queryKey: ['me', 'preferences'],
    queryFn: async (): Promise<UserPreferences> => {
      const res = await apiFetch('/api/v1/me/preferences');
      if (!res.ok) throw new Error('Failed to load preferences');
      return (await res.json()) as UserPreferences;
    },
  });

  const primaryColor: PrimaryColorPreset = preferences?.primaryColor ?? 'blue';
  const textSize: TextSizePreference = preferences?.textSize ?? 'default';
  const theme = useMemo(() => createAppTheme(primaryColor, textSize), [primaryColor, textSize]);

  if (isPending || preferences === undefined) {
    return null;
  }

  const colorScheme = preferences.theme ?? 'auto';

  return (
    <MantineProvider theme={theme} defaultColorScheme={colorScheme}>
      <SyncColorScheme preferredScheme={colorScheme} />
      <RecentItemsProvider>{children}</RecentItemsProvider>
    </MantineProvider>
  );
}
