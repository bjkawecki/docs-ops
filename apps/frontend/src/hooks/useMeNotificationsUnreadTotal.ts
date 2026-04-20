import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useMe } from './useMe';

type NotificationsResponse = {
  items: unknown[];
  total: number;
};

/**
 * Unread in-app notification count for sidebar badge (uses list endpoint total).
 */
export function useMeNotificationsUnreadTotal() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ['me', 'notifications', 'unread-count'] as const,
    queryFn: async (): Promise<number> => {
      const sp = new URLSearchParams();
      sp.set('limit', '1');
      sp.set('offset', '0');
      sp.set('unreadOnly', 'true');
      const res = await apiFetch(`/api/v1/me/notifications?${sp.toString()}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load notifications');
      }
      const body = (await res.json()) as NotificationsResponse;
      return body.total;
    },
    enabled: !!me,
    staleTime: 30_000,
  });
}
