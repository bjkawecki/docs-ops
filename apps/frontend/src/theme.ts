import { createTheme } from '@mantine/core';
import { camelToKebabCase } from '@mantine/core';

/**
 * Zentrales App-Theme. Werte unter `other` werden per cssVariablesResolver
 * exposed as --mantine-other-<key> (kebab-case).
 */
export const appTheme = createTheme({
  other: {
    /** Sidebar-Hintergrund Dark Mode (z. B. zu Hover dark-6 passend). */
    sidebarBg: 'var(--mantine-color-dark-6)',
    /** Sidebar-Hintergrund Light Mode. */
    sidebarBgLight: 'var(--mantine-color-gray-0)',
    /** Sidebar Hover Dark Mode (etwas heller als sidebarBg). */
    sidebarHover: 'var(--mantine-color-dark-4)',
    /** Sidebar Hover Light Mode. */
    sidebarHoverLight: 'var(--mantine-color-gray-1)',
    /** Sidebar aktiver Link Dark Mode (deutlicher als Hover, z. B. dark-4). */
    sidebarActive: 'var(--mantine-color-dark-4)',
    /** Sidebar aktiver Link Light Mode (z. B. gray-2). */
    sidebarActiveLight: 'var(--mantine-color-gray-2)',
  },
});

type CssVariablesResolverTheme = { other?: Record<string, string> };

/** Nimmt theme.other und schreibt sie als --mantine-other-<kebab-key> in variables. */
export function appCssVariablesResolver(theme: CssVariablesResolverTheme) {
  const variables: Record<string, string> = {};
  const other = theme.other;
  if (other && typeof other === 'object') {
    for (const [key, value] of Object.entries(other)) {
      if (typeof value === 'string') {
        variables[`--mantine-other-${camelToKebabCase(key)}`] = value;
      }
    }
  }
  return { variables, light: {}, dark: {} };
}
