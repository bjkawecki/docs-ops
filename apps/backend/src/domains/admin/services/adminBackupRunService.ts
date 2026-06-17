import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { basename } from 'node:path';
import type { Readable } from 'node:stream';
import { getMaintenanceLock } from '../../../infrastructure/maintenance/maintenanceModeService.js';
import { initStorage } from '../../../infrastructure/storage/index.js';
import { listAdminJobSchedules } from './adminJobsScheduleService.js';
import { getAdminJobsHealth } from './adminJobsQueryService.js';
import { getBackupSettings, updateBackupSettings } from './adminBackupDestinationService.js';
import { isMinioAvailableForBackup } from './operationalBackupService.js';
import { getEffectiveRetentionCount } from '../../../infrastructure/backup/retention.js';
import { enqueueJob } from '../../../infrastructure/jobs/client.js';
import { isBackupEncryptionConfigured } from '../../../infrastructure/crypto/secretBox.js';

function serializeBackupRun(run: {
  id: string;
  destinationId: string | null;
  status: string;
  triggerSource: string;
  triggeredByUserId: string | null;
  archiveSha256: string | null;
  sizeBytes: bigint | null;
  remotePath: string | null;
  localObjectKey: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  destination: { id: string; name: string } | null;
}) {
  return {
    ...run,
    sizeBytes: run.sizeBytes != null ? Number(run.sizeBytes) : null,
  };
}

export async function getBackupStatus(prisma: PrismaClient) {
  const [minioAvailable, health, maintenance, settings, retentionCount] = await Promise.all([
    isMinioAvailableForBackup(),
    getAdminJobsHealth(prisma),
    getMaintenanceLock(prisma),
    getBackupSettings(prisma),
    getEffectiveRetentionCount(prisma),
  ]);

  let schedule: { enabled: boolean; cron: string | null; tz: string | null } = {
    enabled: false,
    cron: null,
    tz: null,
  };
  try {
    const schedules = await listAdminJobSchedules();
    const backupSchedule = schedules.items.find((s) => s.jobName === 'maintenance.backup');
    if (backupSchedule) {
      const cron = typeof backupSchedule.cron === 'string' ? backupSchedule.cron : null;
      const tz = typeof backupSchedule.tz === 'string' ? backupSchedule.tz : null;
      schedule = {
        enabled: true,
        cron,
        tz,
      };
    }
  } catch {
    // queue unavailable
  }

  return {
    minioAvailable,
    workerConnected: health.workerConnected,
    maintenanceActive: maintenance.active,
    encryptionConfigured: isBackupEncryptionConfigured(),
    retentionCount,
    defaultDestinationId: settings.defaultDestinationId,
    autoBackupConfigured: settings.autoBackupConfigured,
    schedule,
  };
}

export async function listBackupRuns(
  prisma: PrismaClient,
  query: { limit: number; offset: number; status?: string }
) {
  const where = query.status ? { status: query.status as never } : undefined;
  const [items, total] = await Promise.all([
    prisma.backupRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
      include: {
        destination: { select: { id: true, name: true } },
      },
    }),
    prisma.backupRun.count({ where }),
  ]);
  return {
    items: items.map(serializeBackupRun),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getBackupRun(prisma: PrismaClient, id: string) {
  const run = await prisma.backupRun.findUnique({
    where: { id },
    include: { destination: { select: { id: true, name: true } } },
  });
  if (!run) return null;
  return serializeBackupRun(run);
}

export async function triggerManualBackup(
  prisma: PrismaClient,
  args: { destinationId?: string; requestedByUserId: string }
) {
  const minioOk = await isMinioAvailableForBackup();
  if (!minioOk) {
    throw new Error('MinIO is not configured or unreachable');
  }
  if (!isBackupEncryptionConfigured()) {
    throw new Error('BACKUP_ENCRYPTION_KEY is not configured');
  }

  const run = await prisma.backupRun.create({
    data: {
      status: 'queued',
      triggerSource: 'manual',
      triggeredByUserId: args.requestedByUserId,
      destinationId: args.destinationId ?? null,
    },
  });

  const jobId = await enqueueJob('maintenance.backup', {
    mode: 'manual',
    backupRunId: run.id,
    destinationId: args.destinationId,
    requestedByUserId: args.requestedByUserId,
  });

  await prisma.backupRun.update({
    where: { id: run.id },
    data: { pgBossJobId: jobId },
  });

  return { backupRunId: run.id, jobId };
}

export async function getLocalBackupDownload(
  prisma: PrismaClient,
  id: string
): Promise<{ body: Readable; contentType: string; filename: string } | null> {
  const run = await prisma.backupRun.findUnique({ where: { id } });
  if (!run?.localObjectKey || run.status !== 'succeeded') return null;
  const storage = await initStorage();
  if (!storage) return null;
  const object = await storage.getObject(run.localObjectKey);
  if (!object) return null;
  return {
    body: object.Body,
    contentType: object.ContentType ?? 'application/zstd',
    filename: basename(run.localObjectKey),
  };
}

export async function deleteLocalBackupCopy(prisma: PrismaClient, id: string) {
  const run = await prisma.backupRun.findUnique({ where: { id } });
  if (!run) return null;
  if (run.status !== 'succeeded') {
    throw new Error('Only succeeded backups can have their local copy removed');
  }
  if (!run.localObjectKey) {
    throw new Error('Local copy is already removed');
  }

  const storage = await initStorage();
  if (storage) {
    await storage.deleteObject(run.localObjectKey).catch(() => undefined);
  }

  const updated = await prisma.backupRun.update({
    where: { id },
    data: { localObjectKey: null },
    include: { destination: { select: { id: true, name: true } } },
  });
  return serializeBackupRun(updated);
}

export async function deleteFailedBackupRun(prisma: PrismaClient, id: string): Promise<boolean> {
  const run = await prisma.backupRun.findUnique({ where: { id } });
  if (!run) return false;
  if (run.status !== 'failed') {
    throw new Error('Only failed backup runs can be deleted');
  }

  if (run.localObjectKey) {
    const storage = await initStorage();
    if (storage) {
      await storage.deleteObject(run.localObjectKey).catch(() => undefined);
    }
  }

  await prisma.backupRun.delete({ where: { id } });
  return true;
}

export { updateBackupSettings };
