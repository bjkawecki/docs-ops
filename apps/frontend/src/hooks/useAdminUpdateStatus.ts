import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type {
  AdminSystemCheckUpdatesResponse,
  AdminSystemSettings,
  AdminSystemUpdateStatus,
  AdminUpdateRun,
  PatchAdminSystemSettingsBody,
} from 'backend/api-types';
import { apiFetch } from '../api/client.js';

export const adminUpdateStatusQueryKey = ['admin', 'system', 'update-status'] as const;
export const adminSystemSettingsQueryKey = ['admin', 'system', 'settings'] as const;

async function fetchAdminUpdateStatus(): Promise<AdminSystemUpdateStatus> {
  const res = await apiFetch('/api/v1/admin/system/update-status');
  if (!res.ok) {
    throw new Error('Could not load update status');
  }
  return res.json() as Promise<AdminSystemUpdateStatus>;
}

async function fetchAdminSystemSettings(): Promise<AdminSystemSettings> {
  const res = await apiFetch('/api/v1/admin/system/settings');
  if (!res.ok) {
    throw new Error('Could not load system settings');
  }
  return res.json() as Promise<AdminSystemSettings>;
}

async function patchAdminSystemSettings(
  body: PatchAdminSystemSettingsBody
): Promise<AdminSystemSettings> {
  const res = await apiFetch('/api/v1/admin/system/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error('Could not update system settings');
  }
  return res.json() as Promise<AdminSystemSettings>;
}

async function postCheckForUpdates(): Promise<AdminSystemCheckUpdatesResponse> {
  const res = await apiFetch('/api/v1/admin/system/check-updates', { method: 'POST' });
  if (!res.ok) {
    throw new Error('Update check failed');
  }
  return res.json() as Promise<AdminSystemCheckUpdatesResponse>;
}

async function postApplySystemUpdate(): Promise<{ updateRunId: string; status: 'backing_up' }> {
  const res = await apiFetch('/api/v1/admin/updates/apply', { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not start update');
  }
  return res.json() as Promise<{ updateRunId: string; status: 'backing_up' }>;
}

async function fetchUpdateRun(id: string): Promise<AdminUpdateRun> {
  const res = await apiFetch(`/api/v1/admin/updates/${id}`);
  if (!res.ok) {
    throw new Error('Could not load update status');
  }
  return res.json() as Promise<AdminUpdateRun>;
}

export function useAdminUpdateStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminUpdateStatusQueryKey,
    queryFn: fetchAdminUpdateStatus,
    enabled: options?.enabled !== false,
    staleTime: 5_000,
    refetchInterval: (query) => (query.state.data?.activeUpdateRun != null ? 3000 : false),
  });
}

export function useAdminSystemSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminSystemSettingsQueryKey,
    queryFn: fetchAdminSystemSettings,
    enabled: options?.enabled !== false,
    staleTime: 60_000,
  });
}

export function usePatchAdminSystemSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchAdminSystemSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(adminSystemSettingsQueryKey, data);
      void queryClient.invalidateQueries({ queryKey: adminUpdateStatusQueryKey });
    },
  });
}

export function useCheckForUpdates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postCheckForUpdates,
    onSuccess: (data) => {
      queryClient.setQueryData(adminUpdateStatusQueryKey, data.status);
    },
  });
}

export function useApplySystemUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postApplySystemUpdate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminUpdateStatusQueryKey });
    },
  });
}

export function usePollUpdateRun(updateRunId: string | null, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'updates', updateRunId] as const,
    queryFn: () => fetchUpdateRun(updateRunId!),
    enabled: options?.enabled !== false && updateRunId != null,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (data == null) return 2000;
      if (data.status === 'succeeded' || data.status === 'failed') return false;
      return 2000;
    },
  });

  useEffect(() => {
    const data = query.data;
    if (data?.status === 'succeeded' || data?.status === 'failed') {
      void queryClient.invalidateQueries({ queryKey: adminUpdateStatusQueryKey });
      void queryClient.invalidateQueries({ queryKey: ['maintenance', 'status'] });
    }
  }, [query.data, queryClient]);

  return query;
}
