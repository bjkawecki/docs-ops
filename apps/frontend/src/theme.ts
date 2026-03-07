import { createTheme } from '@mantine/core';
import { camelToKebabCase } from '@mantine/core';

/** User-selectable primary color preset names. */
export type PrimaryColorPreset =
  | 'blue'
  | 'green'
  | 'violet'
  | 'teal'
  | 'indigo'
  | 'amber'
  | 'sky'
  | 'rose'
  | 'orange'
  | 'fuchsia';

/** All preset names for UI (e.g. Settings dropdown). */
export const PRIMARY_COLOR_PRESETS: readonly PrimaryColorPreset[] = [
  'blue',
  'green',
  'violet',
  'teal',
  'indigo',
  'amber',
  'sky',
  'rose',
  'orange',
  'fuchsia',
] as const;

/** Human-readable labels for each preset (precise color names). Single-line for dropdown. */
export const PRIMARY_COLOR_PRESET_LABELS: Record<PrimaryColorPreset, string> = {
  blue: 'Cornflower (default)',
  green: 'Emerald',
  violet: 'Violet',
  teal: 'Teal',
  indigo: 'Indigo',
  amber: 'Amber',
  sky: 'Sky',
  rose: 'Rose',
  orange: 'Orange',
  fuchsia: 'Fuchsia',
};

/** Cornflower-blue; 400 (#5e82ff) at index 4 as primary accent. */
const blueScale = [
  '#eef2ff',
  '#dae2ff',
  '#bdccff',
  '#90acff',
  '#5e82ff',
  '#3554fc',
  '#1f32f1',
  '#171ede',
  '#191bb4',
  '#1a1e8e',
] as const;

/** Emerald-style green; accent at index 6. */
const greenScale = [
  '#ecfdf5',
  '#d1fae5',
  '#a7f3d0',
  '#6ee7b7',
  '#34d399',
  '#10b981',
  '#059669', // 6
  '#047857',
  '#065f46',
  '#064e3b',
] as const;

/** Violet; accent at index 6. */
const violetScale = [
  '#f5f3ff',
  '#ede9fe',
  '#ddd6fe',
  '#c4b5fd',
  '#a78bfa',
  '#8b5cf6',
  '#7c3aed', // 6
  '#6d28d9',
  '#5b21b6',
  '#4c1d95',
] as const;

/** Teal; accent at index 6. */
const tealScale = [
  '#f0fdfa',
  '#ccfbf1',
  '#99f6e4',
  '#5eead4',
  '#2dd4bf',
  '#14b8a6',
  '#0d9488', // 6
  '#0f766e',
  '#115e59',
  '#134e4a',
] as const;

/** Indigo; accent at index 6. */
const indigoScale = [
  '#eef2ff',
  '#e0e7ff',
  '#c7d2fe',
  '#a5b4fc',
  '#818cf8',
  '#6366f1',
  '#4f46e5', // 6
  '#4338ca',
  '#3730a3',
  '#312e81',
] as const;

/** Amber; accent at index 6. */
const amberScale = [
  '#fffbeb',
  '#fef3c7',
  '#fde68a',
  '#fcd34d',
  '#fbbf24',
  '#f59e0b',
  '#d97706', // 6
  '#b45309',
  '#92400e',
  '#78350f',
] as const;

/** Sky; accent at index 6. */
const skyScale = [
  '#f0f9ff',
  '#e0f2fe',
  '#bae6fd',
  '#7dd3fc',
  '#38bdf8',
  '#0ea5e9',
  '#0284c7', // 6
  '#0369a1',
  '#075985',
  '#0c4a6e',
] as const;

/** Rose; accent at index 6. */
const roseScale = [
  '#fff1f2',
  '#ffe4e6',
  '#fecdd3',
  '#fda4af',
  '#fb7185',
  '#f43f5e',
  '#e11d48', // 6
  '#be123c',
  '#9f1239',
  '#881337',
] as const;

/** Orange; accent at index 6. */
const orangeScale = [
  '#fff7ed',
  '#ffedd5',
  '#fed7aa',
  '#fdba74',
  '#fb923c',
  '#f97316',
  '#ea580c', // 6
  '#c2410c',
  '#9a3412',
  '#7c2d12',
] as const;

/** Fuchsia; accent at index 6. */
const fuchsiaScale = [
  '#fdf4ff',
  '#fae8ff',
  '#f5d0fe',
  '#f0abfc',
  '#e879f9',
  '#d946ef',
  '#c026d3', // 6
  '#a21caf',
  '#86198f',
  '#701a75',
] as const;

type ColorScale = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/** All preset palettes (10 shades each); key = preset name = Mantine color name. */
export const PRIMARY_COLOR_PALETTES: Record<PrimaryColorPreset, ColorScale> = {
  blue: [...blueScale],
  green: [...greenScale],
  violet: [...violetScale],
  teal: [...tealScale],
  indigo: [...indigoScale],
  amber: [...amberScale],
  sky: [...skyScale],
  rose: [...roseScale],
  orange: [...orangeScale],
  fuchsia: [...fuchsiaScale],
};

/**
 * Builds the app theme with the given primary color preset.
 * Used by ThemeFromPreferences; main.tsx keeps createAppTheme('blue') for login/unauthenticated.
 */
export function createAppTheme(primaryColor: PrimaryColorPreset) {
  return createTheme({
    primaryColor,
    primaryShade: 4 /* Cornflower primary = #5e82ff at index 4 */,
    colors: {
      blue: [...PRIMARY_COLOR_PALETTES.blue],
      green: [...PRIMARY_COLOR_PALETTES.green],
      violet: [...PRIMARY_COLOR_PALETTES.violet],
      teal: [...PRIMARY_COLOR_PALETTES.teal],
      indigo: [...PRIMARY_COLOR_PALETTES.indigo],
      amber: [...PRIMARY_COLOR_PALETTES.amber],
      sky: [...PRIMARY_COLOR_PALETTES.sky],
      rose: [...PRIMARY_COLOR_PALETTES.rose],
      orange: [...PRIMARY_COLOR_PALETTES.orange],
      fuchsia: [...PRIMARY_COLOR_PALETTES.fuchsia],
    },
    components: {
      Pagination: {
        defaultProps: { color: primaryColor },
      },
      Tabs: {
        defaultProps: { color: primaryColor },
      },
    },
    other: {
      sidebarBg: 'var(--mantine-color-dark-6)',
      sidebarBgLight: 'var(--mantine-color-gray-0)',
      sidebarHover: 'var(--mantine-color-dark-4)',
      sidebarHoverLight: 'var(--mantine-color-gray-1)',
      sidebarActive: 'var(--mantine-color-dark-4)',
      sidebarActiveLight: 'var(--mantine-color-gray-2)',
    },
  });
}

/** Default theme for unauthenticated shell (e.g. main.tsx, login). */
export const appTheme = createAppTheme('blue');

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
