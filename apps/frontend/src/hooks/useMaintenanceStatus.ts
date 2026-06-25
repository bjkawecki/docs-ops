import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export type MaintenanceStatus = {
  active: boolean;
  reason?: 'backup' | 'restore' | 'platform-import' | 'update';
  startedAt?: string;
};

export function maintenanceStatusQueryKey(): readonly ['maintenance', 'status'] {
  return ['maintenance', 'status'] as const;
}

/** Fetch-on-mount; live updates via SSE (plan §23a). Poll while maintenance is active. */
export function useMaintenanceStatus() {
  return useQuery({
    queryKey: maintenanceStatusQueryKey(),
    queryFn: async (): Promise<MaintenanceStatus> => {
      const res = await apiFetch('/api/v1/maintenance/status');
      if (!res.ok) throw new Error('Failed to load maintenance status');
      return res.json() as Promise<MaintenanceStatus>;
    },
    staleTime: 5_000,
    refetchInterval: (query) => (query.state.data?.active ? 3000 : false),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
