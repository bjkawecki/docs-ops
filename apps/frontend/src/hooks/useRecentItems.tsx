import { createContext, useCallback, useContext } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useMe, meQueryKey } from './useMe';

const MAX_ITEMS = 8;

export type RecentItemType = 'process' | 'project' | 'document';

export interface RecentItem {
  type: RecentItemType;
  id: string;
  name?: string;
}

/** Scope for "recently viewed" – organisational unit or user-related. */
export type RecentScope =
  | { type: 'company'; id: string }
  | { type: 'department'; id: string }
  | { type: 'team'; id: string }
  | { type: 'personal' }
  | { type: 'shared' };

export function scopeToKey(scope: RecentScope): string {
  if (scope.type === 'personal' || scope.type === 'shared') return scope.type;
  return `${scope.type}:${scope.id}`;
}

export interface RecentItemsContextValue {
  /** List for the given scope; addRecent(item, scope) writes to this scope. */
  addRecent: (item: RecentItem, scope: RecentScope) => void;
  isPending: boolean;
}

const RecentItemsContext = createContext<RecentItemsContextValue | null>(null);

/**
 * Normalises API entries to RecentItem (name optional from backend).
 */
function fromPreferences(
  raw: { type: string; id: string; name?: string }[] | undefined
): RecentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is RecentItem =>
      x != null &&
      typeof x === 'object' &&
      (x.type === 'process' || x.type === 'project' || x.type === 'document') &&
      typeof x.id === 'string'
  );
}

/**
 * Aggregate recent items from all scopes (for dashboard). Deduplicates by type+id, keeps order, limits count.
 */
export function getAggregatedRecentItems(
  recentItemsByScope: Record<string, { type: string; id: string; name?: string }[]> | undefined,
  limit = 10
): RecentItem[] {
  if (!recentItemsByScope || typeof recentItemsByScope !== 'object') return [];
  const seen = new Set<string>();
  const result: RecentItem[] = [];
  for (const list of Object.values(recentItemsByScope)) {
    const items = fromPreferences(list);
    for (const item of items) {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
      if (result.length >= limit) return result;
    }
  }
  return result;
}

/**
 * Provider for recently viewed contexts/documents per scope.
 * Liest aus GET /me (preferences.recentItemsByScope), schreibt per PATCH /me/preferences.
 */
export function RecentItemsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const patchPreferences = useMutation({
    mutationFn: async (payload: { scopeKey: string; list: RecentItem[] }) => {
      const res = await apiFetch('/api/v1/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          recentItemsByScope: { [payload.scopeKey]: payload.list },
        }),
      });
      if (!res.ok) throw new Error('Failed to save recent items');
      return (await res.json()) as { recentItemsByScope?: Record<string, RecentItem[]> };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
    },
  });

  const addRecent = useCallback(
    (item: RecentItem, scope: RecentScope) => {
      const scopeKey = scopeToKey(scope);
      const current = fromPreferences(me?.preferences?.recentItemsByScope?.[scopeKey]);
      const filtered = current.filter((x) => !(x.type === item.type && x.id === item.id));
      const next = [{ ...item }, ...filtered].slice(0, MAX_ITEMS);
      patchPreferences.mutate({ scopeKey, list: next });
    },
    [me?.preferences?.recentItemsByScope, patchPreferences]
  );

  return (
    <RecentItemsContext.Provider
      value={{
        addRecent,
        isPending: patchPreferences.isPending,
      }}
    >
      {children}
    </RecentItemsContext.Provider>
  );
}

/** Return type of useRecentItems(scope): list for this scope + addRecent bound to scope. */
export interface UseRecentItemsReturn {
  items: RecentItem[];
  addRecent: (item: RecentItem) => void;
  isPending: boolean;
}

/**
 * Recently viewed entries for a scope (company/department/team).
 * Read from me.preferences.recentItemsByScope[scopeKey]; adding via addRecent(item) writes to this scope.
 */
export function useRecentItems(scope: RecentScope | null): UseRecentItemsReturn {
  const ctx = useContext(RecentItemsContext);
  const { data: me } = useMe();

  if (!ctx) {
    return {
      items: [],
      addRecent: () => {},
      isPending: false,
    };
  }

  const items =
    scope === null ? [] : fromPreferences(me?.preferences?.recentItemsByScope?.[scopeToKey(scope)]);

  const addRecentBound =
    scope === null ? () => {} : (item: RecentItem) => ctx.addRecent(item, scope);

  return {
    items,
    addRecent: addRecentBound,
    isPending: ctx.isPending,
  };
}

/** Context actions (e.g. addRecent with dynamic scope from API owner). */
export function useRecentItemsActions(): RecentItemsContextValue | null {
  return useContext(RecentItemsContext);
}
