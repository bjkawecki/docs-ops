import type { PrismaClient } from '../../../generated/prisma/client.js';
import { resolveAppVersion } from '../appVersion.js';
import { compareSemver } from '../../domains/admin/utils/compareSemver.js';
import { getUpdateApplyTimeoutSeconds } from '../updater/updaterSidecarClient.js';
import {
  completeUpdateRunSuccess,
  failUpdateRun,
} from '../../domains/admin/services/adminSystemUpdateApplyService.js';
import { releaseMaintenanceLockIfOwned } from './maintenanceModeService.js';
import { refreshMaintenanceLiveState } from '../liveEvents/refreshMaintenanceLiveState.js';
import { reconcileFailedPreUpdateBackups } from './reconcileFailedPreUpdateBackups.js';

export async function reconcileUpdateRunsOnStartup(prisma: PrismaClient): Promise<void> {
  await reconcileFailedPreUpdateBackups(prisma);
  const installedVersion = resolveAppVersion();
  const timeoutMs = getUpdateApplyTimeoutSeconds() * 1000;
  const now = Date.now();

  const applyingRuns = await prisma.updateRun.findMany({
    where: { status: 'applying' },
    orderBy: { createdAt: 'desc' },
  });

  for (const run of applyingRuns) {
    const cmp = compareSemver(installedVersion, run.targetVersion);
    if (cmp != null && cmp >= 0) {
      await completeUpdateRunSuccess(prisma, run.id);
      continue;
    }

    const startedMs = (run.startedAt ?? run.createdAt).getTime();
    if (now - startedMs > timeoutMs) {
      await failUpdateRun(
        prisma,
        run.id,
        `Update did not complete within ${getUpdateApplyTimeoutSeconds()} seconds`
      );
    }
  }

  const staleBackingUp = await prisma.updateRun.findMany({
    where: { status: 'backing_up' },
    include: { backupRun: { select: { status: true, errorMessage: true } } },
  });

  for (const run of staleBackingUp) {
    const backup = run.backupRun;
    const backupStatus = backup?.status;
    if (backupStatus === 'failed') {
      continue;
    }
    if (backupStatus === 'succeeded') {
      continue;
    }
    const startedMs = (run.startedAt ?? run.createdAt).getTime();
    if (now - startedMs > timeoutMs) {
      await failUpdateRun(prisma, run.id, 'Pre-update backup timed out');
    }
  }

  const staleQueued = await prisma.updateRun.findMany({
    where: { status: 'queued' },
  });
  for (const run of staleQueued) {
    const startedMs = (run.startedAt ?? run.createdAt).getTime();
    if (now - startedMs > timeoutMs) {
      await failUpdateRun(prisma, run.id, 'Update run timed out in queued state');
    }
  }

  const lock = await prisma.systemMaintenanceLock.findUnique({ where: { id: 'backup' } });
  if (lock?.reason === 'update' && lock.updateRunId) {
    const run = await prisma.updateRun.findUnique({ where: { id: lock.updateRunId } });
    if (!run || run.status === 'succeeded' || run.status === 'failed') {
      await releaseMaintenanceLockIfOwned(prisma, {
        reason: 'update',
        runId: lock.updateRunId,
      }).catch(() => undefined);
      await refreshMaintenanceLiveState(prisma);
    }
  }
}
