import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { MeResponse } from '../api/me-types';

export const meQueryKey = ['me'] as const;

export async function fetchMe(): Promise<MeResponse> {
  const res = await apiFetch('/api/v1/me');
  if (!res.ok) throw new Error(res.status === 401 ? 'Unauthorized' : 'Failed to load me');
  return (await res.json()) as MeResponse;
}

/**
 * User data (GET /api/v1/me). Shared queryKey and queryFn for all consumers.
 */
export function useMe(options?: Partial<UseQueryOptions<MeResponse>>) {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    ...options,
  });
}
