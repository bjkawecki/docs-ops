import { type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export type UserPreferences = {
  theme?: 'light' | 'dark' | 'auto';
  sidebarPinned?: boolean;
  locale?: 'en' | 'de';
};

export function ThemeFromPreferences({ children }: { children: ReactNode }) {
  const { data: preferences, isPending } = useQuery({
    queryKey: ['me', 'preferences'],
    queryFn: async (): Promise<UserPreferences> => {
      const res = await apiFetch('/api/v1/me/preferences');
      if (!res.ok) throw new Error('Failed to load preferences');
      return res.json();
    },
  });

  if (isPending || preferences === undefined) {
    return null;
  }

  const colorScheme = preferences.theme ?? 'light';
  return <MantineProvider defaultColorScheme={colorScheme}>{children}</MantineProvider>;
}
