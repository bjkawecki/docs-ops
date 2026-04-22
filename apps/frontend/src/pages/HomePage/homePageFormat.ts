import type { DashboardSearchItem } from './homePageTypes';

export function scopeTypeLabel(scopeType: string): string {
  return scopeType.charAt(0).toUpperCase() + scopeType.slice(1);
}

export function dashboardSearchContextSubtitle(doc: DashboardSearchItem): string | null {
  const name = doc.contextName?.trim();
  if (name) return name;
  if (doc.contextType === 'process') return 'Prozess';
  if (doc.contextType === 'project') return 'Projekt';
  if (doc.contextType === 'subcontext') return 'Unterkontext';
  return null;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
