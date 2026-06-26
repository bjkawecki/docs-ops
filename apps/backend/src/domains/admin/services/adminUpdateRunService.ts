import type { PrismaClient, UpdateRunStatus } from '../../../../generated/prisma/client.js';
import { IN_PROGRESS_UPDATE_STATUSES } from '../../../infrastructure/maintenance/maintenanceModeService.js';
import { reconcileFailedPreUpdateBackups } from '../../../infrastructure/maintenance/reconcileFailedPreUpdateBackups.js';
import type { AdminUpdateRun } from '../schemas/updates.js';

export function serializeUpdateRun(run: {
  id: string;
  status: UpdateRunStatus;
  targetVersion: string;
  targetReleaseTag: string;
  backupRunId: string | null;
  errorMessage: string | null;
  agentPhase: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}): AdminUpdateRun {
  return {
    id: run.id,
    status: run.status,
    targetVersion: run.targetVersion,
    targetReleaseTag: run.targetReleaseTag,
    backupRunId: run.backupRunId,
    errorMessage: run.errorMessage,
    agentPhase: run.agentPhase,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
  };
}

export async function getActiveUpdateRun(prisma: PrismaClient) {
  await reconcileFailedPreUpdateBackups(prisma);
  const run = await prisma.updateRun.findFirst({
    where: { status: { in: [...IN_PROGRESS_UPDATE_STATUSES] } },
    orderBy: { createdAt: 'desc' },
  });
  return run ? serializeUpdateRun(run) : null;
}

export async function getUpdateRunById(prisma: PrismaClient, id: string) {
  const run = await prisma.updateRun.findUnique({ where: { id } });
  return run ? serializeUpdateRun(run) : null;
}

export async function hasInProgressUpdateRun(prisma: PrismaClient): Promise<boolean> {
  const count = await prisma.updateRun.count({
    where: { status: { in: [...IN_PROGRESS_UPDATE_STATUSES] } },
  });
  return count > 0;
}
