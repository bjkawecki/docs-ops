import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { resolveAppVersion } from '../../../infrastructure/appVersion.js';
import { enqueueJob } from '../../../infrastructure/jobs/client.js';
import { refreshMaintenanceLiveState } from '../../../infrastructure/liveEvents/refreshMaintenanceLiveState.js';
import {
  assertMaintenanceAvailable,
  releaseMaintenanceLockIfOwned,
  tryAcquireMaintenanceLock,
} from '../../../infrastructure/maintenance/maintenanceModeService.js';
import {
  applyUpdateViaAgent,
  isAgentConfigured,
} from '../../../infrastructure/agent/hostAgentClient.js';
import type { JobPayloadByType } from '../../../infrastructure/jobs/jobTypes.js';
import { isBackupEncryptionConfigured } from '../../../infrastructure/crypto/secretBox.js';
import {
  getAdminSystemUpdateStatus,
  resetAdminSystemUpdateCacheForTests,
} from './adminSystemUpdateService.js';
import { isMinioAvailableForBackup } from './operationalBackupService.js';
import { getUpdateRunById, serializeUpdateRun } from './adminUpdateRunService.js';

export type JobLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

async function notifyAdmins(
  prisma: PrismaClient,
  eventType: 'update-succeeded' | 'update-failed',
  payload: Record<string, unknown>
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { isAdmin: true, deletedAt: null },
    select: { id: true },
  });
  if (admins.length === 0) return;
  await enqueueJob('notifications.send', {
    eventType,
    targetUserIds: admins.map((a) => a.id),
    payload,
  });
}

export async function failUpdateRun(
  prisma: PrismaClient,
  updateRunId: string,
  error: unknown,
  options?: { notify?: boolean }
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const run = await prisma.updateRun.update({
    where: { id: updateRunId },
    data: {
      status: 'failed',
      errorMessage: message.slice(0, 4000),
      finishedAt: new Date(),
    },
  });
  await releaseMaintenanceLockIfOwned(prisma, {
    reason: 'update',
    runId: updateRunId,
  }).catch(() => undefined);
  await refreshMaintenanceLiveState(prisma);
  if (options?.notify !== false) {
    await notifyAdmins(prisma, 'update-failed', {
      updateRunId,
      targetVersion: run.targetVersion,
      errorMessage: message.slice(0, 500),
    });
  }
}

export async function completeUpdateRunSuccess(
  prisma: PrismaClient,
  updateRunId: string
): Promise<void> {
  const run = await prisma.updateRun.update({
    where: { id: updateRunId },
    data: {
      status: 'succeeded',
      errorMessage: null,
      finishedAt: new Date(),
    },
  });
  await releaseMaintenanceLockIfOwned(prisma, {
    reason: 'update',
    runId: updateRunId,
  }).catch(() => undefined);
  await refreshMaintenanceLiveState(prisma);
  resetAdminSystemUpdateCacheForTests();
  await notifyAdmins(prisma, 'update-succeeded', {
    updateRunId,
    targetVersion: run.targetVersion,
    installedVersion: resolveAppVersion(),
  });
}

export async function failUpdateRunForBackup(
  prisma: PrismaClient,
  backupRunId: string,
  error: unknown
): Promise<void> {
  const updateRun = await prisma.updateRun.findFirst({
    where: {
      backupRunId,
      status: { in: ['queued', 'backing_up', 'applying'] },
    },
  });
  if (!updateRun) return;
  await failUpdateRun(prisma, updateRun.id, error);
}

export async function startAdminSystemUpdateApply(
  prisma: PrismaClient,
  requestedByUserId: string
): Promise<{ updateRunId: string; status: 'backing_up' }> {
  if (!isAgentConfigured()) {
    throw new Error('Host agent is not configured');
  }

  await assertMaintenanceAvailable(prisma);

  const status = await getAdminSystemUpdateStatus(prisma, { refresh: true });
  if (!status.updateCheckEnabled) {
    throw new Error('Update checks are disabled');
  }
  if (!status.updateAvailable || status.latestVersion == null || status.latestReleaseTag == null) {
    throw new Error('No update available');
  }

  const inProgress = await prisma.updateRun.findFirst({
    where: { status: { in: ['queued', 'backing_up', 'applying'] } },
  });
  if (inProgress) {
    throw new Error('A system update is already in progress');
  }

  const minioOk = await isMinioAvailableForBackup();
  if (!minioOk) {
    throw new Error('MinIO is not configured or unreachable');
  }
  if (!isBackupEncryptionConfigured()) {
    throw new Error('BACKUP_ENCRYPTION_KEY is not configured');
  }

  const backupRun = await prisma.backupRun.create({
    data: {
      status: 'queued',
      triggerSource: 'pre_update',
      triggeredByUserId: requestedByUserId,
    },
  });

  const updateRun = await prisma.updateRun.create({
    data: {
      status: 'backing_up',
      targetVersion: status.latestVersion,
      targetReleaseTag: status.latestReleaseTag,
      backupRunId: backupRun.id,
      triggeredByUserId: requestedByUserId,
      startedAt: new Date(),
    },
  });

  const jobId = await enqueueJob('maintenance.backup', {
    mode: 'pre_update',
    backupRunId: backupRun.id,
    updateRunId: updateRun.id,
    requestedByUserId,
  });

  await prisma.backupRun.update({
    where: { id: backupRun.id },
    data: { pgBossJobId: jobId },
  });

  return { updateRunId: updateRun.id, status: 'backing_up' };
}

export async function runApplySystemUpdate(
  prisma: PrismaClient,
  payload: JobPayloadByType['maintenance.apply-update'],
  logger: JobLogger
): Promise<void> {
  const updateRun = await prisma.updateRun.findUnique({ where: { id: payload.updateRunId } });
  if (!updateRun) {
    throw new Error('Update run not found');
  }
  if (updateRun.status !== 'backing_up') {
    throw new Error(`Update run is not ready for apply (status: ${updateRun.status})`);
  }

  await tryAcquireMaintenanceLock(prisma, {
    reason: 'update',
    updateRunId: updateRun.id,
  });
  await refreshMaintenanceLiveState(prisma);

  await prisma.updateRun.update({
    where: { id: updateRun.id },
    data: { status: 'applying' },
  });

  try {
    await applyUpdateViaAgent(updateRun.targetReleaseTag, updateRun.id);
    await enqueueJob('maintenance.watch-update', { updateRunId: updateRun.id });
    logger.info(
      { updateRunId: updateRun.id, targetReleaseTag: updateRun.targetReleaseTag },
      'System update apply triggered via host agent'
    );
  } catch (error) {
    await failUpdateRun(prisma, updateRun.id, error);
    throw error;
  }
}

export async function getAdminUpdateApplyResult(prisma: PrismaClient, updateRunId: string) {
  const run = await getUpdateRunById(prisma, updateRunId);
  if (!run) return null;
  return run;
}

export { serializeUpdateRun };
