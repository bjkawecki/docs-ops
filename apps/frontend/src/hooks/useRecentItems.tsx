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

/** Scope für „Zuletzt angesehene“ – eine Organisationseinheit. */
export type RecentScope =
  | { type: 'company'; id: string }
  | { type: 'department'; id: string }
  | { type: 'team'; id: string };

export function scopeToKey(scope: RecentScope): string {
  return `${scope.type}:${scope.id}`;
}

export interface RecentItemsContextValue {
  /** Liste für den übergebenen Scope; addRecent(item, scope) schreibt in diesen Scope. */
  addRecent: (item: RecentItem, scope: RecentScope) => void;
  isPending: boolean;
}

const RecentItemsContext = createContext<RecentItemsContextValue | null>(null);

/**
 * Normalisiert API-Einträge zu RecentItem (name optional vom Backend).
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
 * Provider für zuletzt angesehene Kontexte/Dokumente pro Scope.
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

/** Rückgabe von useRecentItems(scope): Liste für diesen Scope + addRecent gebunden an Scope. */
export interface UseRecentItemsReturn {
  items: RecentItem[];
  addRecent: (item: RecentItem) => void;
  isPending: boolean;
}

/**
 * Zuletzt angesehene Einträge für einen Scope (company/department/team).
 * Lesen aus me.preferences.recentItemsByScope[scopeKey], Hinzufügen per addRecent(item) schreibt in diesen Scope.
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

/** Kontext-Aktionen (z. B. addRecent mit dynamischem Scope aus API-Owner). */
export function useRecentItemsActions(): RecentItemsContextValue | null {
  return useContext(RecentItemsContext);
}
