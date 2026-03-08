import { useMantineColorScheme } from '@mantine/core';
import { useSyncExternalStore } from 'react';

function getResolvedScheme(colorScheme: 'light' | 'dark' | 'auto'): 'light' | 'dark' {
  if (colorScheme === 'light') return 'light';
  if (colorScheme === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function subscribeToPreferredScheme(callback: () => void) {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/**
 * Returns the effective color scheme for styling: always 'light' or 'dark'.
 * When the user preference is 'auto', follows system preference (prefers-color-scheme).
 * Use this for conditional styles (e.g. sidebar/navbar) so they match the rest of the app in auto mode.
 */
export function useResolvedColorScheme(): 'light' | 'dark' {
  const { colorScheme } = useMantineColorScheme();
  return useSyncExternalStore(
    subscribeToPreferredScheme,
    () => getResolvedScheme(colorScheme),
    () => 'light'
  );
}
