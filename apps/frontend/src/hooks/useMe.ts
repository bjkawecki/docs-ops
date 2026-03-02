import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { MeResponse } from '../api/me-types';

export const meQueryKey = ['me'] as const;

export async function fetchMe(): Promise<MeResponse> {
  const res = await apiFetch('/api/v1/me');
  if (!res.ok) throw new Error(res.status === 401 ? 'Unauthorized' : 'Failed to load me');
  return res.json();
}

/**
 * Nutzerdaten (GET /api/v1/me). Einheitliche queryKey + queryFn für alle Consumer.
 */
export function useMe(options?: Partial<UseQueryOptions<MeResponse>>) {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    ...options,
  });
}
