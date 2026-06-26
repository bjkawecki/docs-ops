import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { resolveAppVersion } from '../../../infrastructure/appVersion.js';
import { compareSemver } from '../utils/compareSemver.js';
import {
  completeUpdateRunSuccess,
  failUpdateRun,
  type JobLogger,
} from './adminSystemUpdateApplyService.js';
import {
  getSidecarUpdateStatus,
  getUpdateApplyTimeoutSeconds,
  formatSidecarUpdateFailure,
} from '../../../infrastructure/updater/updaterSidecarClient.js';
import type { JobPayloadByType } from '../../../infrastructure/jobs/jobTypes.js';

const POLL_INTERVAL_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWatchSystemUpdate(
  prisma: PrismaClient,
  payload: JobPayloadByType['maintenance.watch-update'],
  logger: JobLogger
): Promise<void> {
  const updateRun = await prisma.updateRun.findUnique({ where: { id: payload.updateRunId } });
  if (!updateRun) {
    throw new Error('Update run not found');
  }
  if (updateRun.status === 'succeeded' || updateRun.status === 'failed') {
    return;
  }
  if (updateRun.status !== 'applying') {
    throw new Error(`Update run is not applying (status: ${updateRun.status})`);
  }

  const timeoutMs = getUpdateApplyTimeoutSeconds() * 1000;
  const startedMs = (updateRun.startedAt ?? updateRun.createdAt).getTime();

  while (Date.now() - startedMs < timeoutMs) {
    const installedCmp = compareSemver(resolveAppVersion(), updateRun.targetVersion);
    if (installedCmp != null && installedCmp >= 0) {
      await completeUpdateRunSuccess(prisma, updateRun.id);
      logger.info({ updateRunId: updateRun.id }, 'System update completed after version match');
      return;
    }

    let sidecarStatus;
    try {
      sidecarStatus = await getSidecarUpdateStatus();
    } catch (error) {
      logger.warn({ updateRunId: updateRun.id, error }, 'Updater sidecar status unavailable');
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (sidecarStatus.running) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (sidecarStatus.exitCode != null && sidecarStatus.exitCode !== 0) {
      const message = formatSidecarUpdateFailure(sidecarStatus);
      await failUpdateRun(prisma, updateRun.id, message);
      logger.error(
        {
          updateRunId: updateRun.id,
          exitCode: sidecarStatus.exitCode,
          containerName: sidecarStatus.containerName,
          containerLogTail: sidecarStatus.containerLogTail,
        },
        'System update failed'
      );
      return;
    }

    if (sidecarStatus.exitCode === 0) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  await failUpdateRun(
    prisma,
    updateRun.id,
    `Update did not complete within ${getUpdateApplyTimeoutSeconds()} seconds`
  );
}
