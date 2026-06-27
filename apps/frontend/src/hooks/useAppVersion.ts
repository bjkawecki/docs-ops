import { useQuery } from '@tanstack/react-query';
import type { SystemVersionResponse } from 'backend/api-types';
import { apiFetch } from '../api/client';

export function appVersionQueryKey(): readonly ['system', 'version'] {
  return ['system', 'version'] as const;
}

export function useAppVersion() {
  return useQuery({
    queryKey: appVersionQueryKey(),
    queryFn: async (): Promise<SystemVersionResponse> => {
      const res = await apiFetch('/api/v1/system/version');
      if (!res.ok) throw new Error('Failed to load app version');
      return res.json() as Promise<SystemVersionResponse>;
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}
