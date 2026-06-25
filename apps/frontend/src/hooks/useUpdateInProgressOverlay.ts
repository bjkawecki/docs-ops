import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { SystemVersionResponse } from 'backend/api-types';
import { apiFetch } from '../api/client.js';
import { useAdminUpdateStatus } from './useAdminUpdateStatus.js';
import { useMaintenanceStatus } from './useMaintenanceStatus.js';

const STORAGE_KEY = 'docsops-update-in-progress';

function readStickyFlag(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setStickyFlag(active: boolean): void {
  try {
    if (active) sessionStorage.setItem(STORAGE_KEY, '1');
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore private mode / blocked storage
  }
}

async function fetchSystemVersion(): Promise<SystemVersionResponse> {
  const res = await apiFetch('/api/v1/system/version');
  if (!res.ok) throw new Error('Failed to load app version');
  return res.json() as Promise<SystemVersionResponse>;
}

export type UpdateOverlayPhase = 'in-progress' | 'reload' | 'failed';

function isUpdateRunInProgress(
  status: string | undefined
): status is 'queued' | 'backing_up' | 'applying' {
  return status === 'queued' || status === 'backing_up' || status === 'applying';
}

export function useUpdateInProgressOverlay(isAdmin: boolean) {
  const maintenanceQuery = useMaintenanceStatus();
  const updateStatusQuery = useAdminUpdateStatus({ enabled: isAdmin });
  const [sticky, setSticky] = useState(readStickyFlag);

  const maintenance = maintenanceQuery.data;
  const activeRun = updateStatusQuery.data?.activeUpdateRun;
  const maintenanceUpdate = maintenance?.active === true && maintenance.reason === 'update';
  const runInProgress = isUpdateRunInProgress(activeRun?.status);
  const liveInProgress = maintenanceUpdate || runInProgress;
  const runFailed = activeRun?.status === 'failed';

  useEffect(() => {
    if (liveInProgress) {
      setStickyFlag(true);
      setSticky(true);
    }
  }, [liveInProgress]);

  useEffect(() => {
    if (activeRun?.status === 'succeeded' || runFailed) {
      setStickyFlag(false);
      setSticky(false);
    }
  }, [activeRun?.status, runFailed]);

  useEffect(() => {
    if (!maintenance?.active && !runInProgress && sticky && activeRun == null) {
      setStickyFlag(false);
      setSticky(false);
    }
  }, [activeRun, maintenance?.active, runInProgress, sticky]);

  const shouldPollRecovery = sticky && !liveInProgress && !runFailed;

  const recoveryQuery = useQuery({
    queryKey: ['system', 'version', 'update-recovery'] as const,
    queryFn: fetchSystemVersion,
    enabled: shouldPollRecovery,
    refetchInterval: shouldPollRecovery ? 3000 : false,
    retry: true,
  });

  const phase: UpdateOverlayPhase = runFailed
    ? 'failed'
    : shouldPollRecovery && recoveryQuery.isSuccess
      ? 'reload'
      : 'in-progress';

  const visible = (liveInProgress || sticky) && !runFailed;

  const dismiss = () => {
    setStickyFlag(false);
    setSticky(false);
  };

  return {
    visible,
    phase,
    dismiss,
    errorMessage: runFailed
      ? (activeRun?.errorMessage ?? 'The update could not be completed.')
      : null,
  };
}
