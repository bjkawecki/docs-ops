import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminSystemCheckUpdatesResponse,
  AdminSystemSettings,
  AdminSystemUpdateStatus,
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

export function useAdminUpdateStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminUpdateStatusQueryKey,
    queryFn: fetchAdminUpdateStatus,
    enabled: options?.enabled !== false,
    staleTime: 1_800_000,
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
