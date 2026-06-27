import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { SystemVersionResponse } from 'backend/api-types';
import { apiFetch } from '../api/client.js';
import { useAdminUpdateStatus } from './useAdminUpdateStatus.js';
import { useMaintenanceStatus } from './useMaintenanceStatus.js';
import { resolveUpdateOverlayPhase, type UpdateOverlayPhase } from './resolveUpdateOverlayPhase.js';

export type { UpdateOverlayPhase };

const STORAGE_KEY = 'docsops-update-in-progress';
const TARGET_VERSION_KEY = 'docsops-update-target-version';

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

function readTargetVersion(): string | null {
  try {
    return sessionStorage.getItem(TARGET_VERSION_KEY);
  } catch {
    return null;
  }
}

function setTargetVersion(version: string | null): void {
  try {
    if (version != null && version !== '') {
      sessionStorage.setItem(TARGET_VERSION_KEY, version);
    } else {
      sessionStorage.removeItem(TARGET_VERSION_KEY);
    }
  } catch {
    // ignore private mode / blocked storage
  }
}

async function fetchSystemVersion(): Promise<SystemVersionResponse> {
  const res = await apiFetch('/api/v1/system/version');
  if (!res.ok) throw new Error('Failed to load app version');
  return res.json() as Promise<SystemVersionResponse>;
}

function isUpdateRunInProgress(
  status: string | undefined
): status is 'queued' | 'backing_up' | 'applying' {
  return status === 'queued' || status === 'backing_up' || status === 'applying';
}

function normalizeReleaseTag(tag: string | null | undefined): string | null {
  if (tag == null || tag.trim() === '') return null;
  return tag.trim().replace(/^v/i, '');
}

export function useUpdateInProgressOverlay(isAdmin: boolean) {
  const maintenanceQuery = useMaintenanceStatus();
  const updateStatusQuery = useAdminUpdateStatus({ enabled: isAdmin });
  const [sticky, setSticky] = useState(readStickyFlag);
  const [targetVersion, setTargetVersionState] = useState<string | null>(readTargetVersion);

  const maintenance = maintenanceQuery.data;
  const activeRun = updateStatusQuery.data?.activeUpdateRun;
  const maintenanceUpdate = maintenance?.active === true && maintenance.reason === 'update';
  const runInProgress = isUpdateRunInProgress(activeRun?.status);
  const liveInProgress = maintenanceUpdate || runInProgress;
  const runFailed = activeRun?.status === 'failed';

  const apiReachable = !maintenanceQuery.isError && (!isAdmin || !updateStatusQuery.isError);

  useEffect(() => {
    if (liveInProgress) {
      setStickyFlag(true);
      setSticky(true);
      const nextTarget =
        normalizeReleaseTag(activeRun?.targetReleaseTag) ??
        normalizeReleaseTag(updateStatusQuery.data?.latestReleaseTag) ??
        targetVersion;
      if (nextTarget != null) {
        setTargetVersion(nextTarget);
        setTargetVersionState(nextTarget);
      }
    }
  }, [
    liveInProgress,
    activeRun?.targetReleaseTag,
    updateStatusQuery.data?.latestReleaseTag,
    targetVersion,
  ]);

  const shouldPollRecovery = sticky && !liveInProgress && !runFailed;

  const recoveryQuery = useQuery({
    queryKey: ['system', 'version', 'update-recovery'] as const,
    queryFn: fetchSystemVersion,
    enabled: shouldPollRecovery,
    refetchInterval: shouldPollRecovery ? 3000 : false,
    retry: true,
  });

  const phase: UpdateOverlayPhase = resolveUpdateOverlayPhase({
    runFailed,
    liveInProgress,
    agentPhase: activeRun?.agentPhase,
    sticky,
    apiReachable,
    recoveryPolling: shouldPollRecovery,
    recoverySuccess: recoveryQuery.isSuccess,
    recoveryVersion: recoveryQuery.data?.version,
    targetVersion,
  });

  const visible = (liveInProgress || sticky) && !runFailed;

  const dismiss = useCallback(() => {
    setStickyFlag(false);
    setSticky(false);
    setTargetVersion(null);
    setTargetVersionState(null);
  }, []);

  return {
    visible,
    phase,
    dismiss,
    errorMessage: runFailed
      ? (activeRun?.errorMessage ?? 'The update could not be completed.')
      : null,
  };
}
