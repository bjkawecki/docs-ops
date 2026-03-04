import type { RecentScope } from '../hooks/useRecentItems';

/**
 * Scope → URL für Navigation (Personal, Company, Department, Team).
 */
export function scopeToUrl(scope: RecentScope): string {
  if (scope.type === 'personal') return '/personal';
  if (scope.type === 'shared') return '/shared';
  if (scope.type === 'company') return '/company';
  if (scope.type === 'department') return `/department/${scope.id}`;
  if (scope.type === 'team') return `/team/${scope.id}`;
  return '/';
}

/** Scope → Anzeige-Label (ohne Namen von Dept/Team). */
export function scopeToLabel(scope: RecentScope): string {
  if (scope.type === 'personal') return 'Personal';
  if (scope.type === 'shared') return 'Shared';
  if (scope.type === 'company') return 'Company';
  if (scope.type === 'department') return 'Department';
  if (scope.type === 'team') return 'Team';
  return 'Context';
}
