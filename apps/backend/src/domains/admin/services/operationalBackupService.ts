import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  PrismaClient,
  BackupDestination,
  Prisma,
} from '../../../../generated/prisma/client.js';
import { refreshMaintenanceLiveState } from '../../../infrastructure/liveEvents/refreshMaintenanceLiveState.js';
import {
  releaseMaintenanceLockIfOwned,
  tryAcquireMaintenanceLock,
} from '../../../infrastructure/maintenance/maintenanceModeService.js';
import { initStorage, type StorageService } from '../../../infrastructure/storage/index.js';
import {
  BACKUP_FORMAT_VERSION,
  sha256File,
  writeManifestFile,
  type BackupManifest,
} from '../../../infrastructure/backup/backupManifest.js';
import { buildZstdTarArchive } from '../../../infrastructure/backup/archiveBuilder.js';
import { exportMinioBucketToDirectory } from '../../../infrastructure/backup/minioExport.js';
import { runPostgresDump } from '../../../infrastructure/backup/postgresDump.js';
import { uploadBackupArchiveToDestination } from '../../../infrastructure/backup/destinationUpload.js';
import {
  applyBackupRetention,
  getEffectiveRetentionCount,
} from '../../../infrastructure/backup/retention.js';
import { enqueueJob } from '../../../infrastructure/jobs/client.js';
import type { JobPayloadByType } from '../../../infrastructure/jobs/jobTypes.js';
import { appVersion } from '../../../infrastructure/appVersion.js';
import { failUpdateRunForBackup } from './adminSystemUpdateApplyService.js';

export type JobLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

async function getStorageOrThrow(): Promise<StorageService> {
  const storage = await initStorage();
  if (!storage) throw new Error('MinIO is not configured or unreachable');
  const ok = await storage.isAvailable();
  if (!ok) throw new Error('MinIO bucket is not reachable');
  return storage;
}

async function resolveDestination(
  prisma: PrismaClient,
  destinationId?: string | null
): Promise<BackupDestination | null> {
  if (destinationId) {
    const dest = await prisma.backupDestination.findFirst({
      where: { id: destinationId, enabled: true },
    });
    return dest;
  }
  const settings = await prisma.backupSettings.findUnique({
    where: { id: 'default' },
    include: { defaultDestination: true },
  });
  if (settings?.defaultDestination?.enabled) return settings.defaultDestination;
  return null;
}

async function notifyAdmins(
  prisma: PrismaClient,
  eventType: 'backup-succeeded' | 'backup-failed',
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

async function failRun(
  prisma: PrismaClient,
  backupRunId: string,
  error: unknown,
  logger: JobLogger
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await prisma.backupRun.update({
    where: { id: backupRunId },
    data: {
      status: 'failed',
      errorMessage: message.slice(0, 2000),
      finishedAt: new Date(),
    },
  });
  logger.error({ backupRunId, error: message }, 'Operational backup failed');
  await notifyAdmins(prisma, 'backup-failed', { backupRunId, errorMessage: message });
  await failUpdateRunForBackup(prisma, backupRunId, error);
}

export async function runOperationalBackup(
  prisma: PrismaClient,
  payload: JobPayloadByType['maintenance.backup'],
  logger: JobLogger
): Promise<void> {
  let backupRunId = payload.mode === 'manual' ? payload.backupRunId : undefined;
  let workDir: string | null = null;

  try {
    const storage = await getStorageOrThrow();

    if (payload.mode === 'schedule') {
      const destination = await resolveDestination(prisma, payload.destinationId);
      if (!destination) {
        throw new Error(
          'No backup destination configured. Set a default destination in Backup settings.'
        );
      }
      const run = await prisma.backupRun.create({
        data: {
          status: 'queued',
          triggerSource: 'schedule',
          destinationId: destination.id,
        },
      });
      backupRunId = run.id;
    }

    if (payload.mode === 'pre_update') {
      backupRunId = payload.backupRunId;
    }

    if (!backupRunId) throw new Error('backupRunId is required');

    if (payload.mode === 'pre_update') {
      await tryAcquireMaintenanceLock(prisma, {
        reason: 'backup',
        backupRunId,
        updateRunId: payload.updateRunId,
      });
    } else {
      await tryAcquireMaintenanceLock(prisma, { reason: 'backup', backupRunId });
    }
    await refreshMaintenanceLiveState(prisma);

    await prisma.backupRun.update({
      where: { id: backupRunId },
      data: { status: 'running', startedAt: new Date() },
    });

    const runRow = await prisma.backupRun.findUniqueOrThrow({ where: { id: backupRunId } });
    const destination = await resolveDestination(
      prisma,
      payload.mode === 'manual'
        ? (payload.destinationId ?? runRow.destinationId)
        : runRow.destinationId
    );

    workDir = await mkdtemp(join(tmpdir(), 'docsops-backup-'));
    const bundleDir = join(workDir, 'bundle');
    const postgresDir = join(bundleDir, 'postgres');
    await mkdir(postgresDir, { recursive: true });
    const dumpPath = join(postgresDir, 'dump.custom');
    await runPostgresDump(dumpPath);
    const dumpSha = await sha256File(dumpPath);
    const dumpStat = await import('node:fs/promises').then((fs) => fs.stat(dumpPath));

    const minioExport = await exportMinioBucketToDirectory(storage, bundleDir);

    const manifest: BackupManifest = {
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      backupRunId,
      createdAt: new Date().toISOString(),
      appVersion,
      postgres: {
        path: 'postgres/dump.custom',
        sizeBytes: dumpStat.size,
        sha256: dumpSha,
      },
      minio: {
        objectCount: minioExport.objectCount,
        totalSizeBytes: minioExport.totalSizeBytes,
        prefix: 'minio/objects',
      },
    };
    await writeManifestFile(join(bundleDir, 'manifest.json'), manifest);

    const archiveName = `docsops-backup-${backupRunId}-${Date.now()}.tar.zst`;
    const archivePath = join(workDir, archiveName);
    await buildZstdTarArchive(bundleDir, archivePath);
    const archiveSha = await sha256File(archivePath);
    const archiveStat = await import('node:fs/promises').then((fs) => fs.stat(archivePath));

    const localKey = `backups/${backupRunId}/${archiveName}`;
    await storage.uploadFilePath(localKey, archivePath, 'application/zstd');

    let remotePath: string | null = null;
    if (destination) {
      await prisma.backupRun.update({
        where: { id: backupRunId },
        data: { status: 'uploading' },
      });
      remotePath = await uploadBackupArchiveToDestination(destination, archivePath, archiveName);
    }

    await prisma.backupRun.update({
      where: { id: backupRunId },
      data: {
        status: 'succeeded',
        destinationId: destination?.id ?? null,
        archiveSha256: archiveSha,
        sizeBytes: BigInt(archiveStat.size),
        remotePath,
        localObjectKey: localKey,
        manifestJson: manifest as Prisma.InputJsonValue,
        finishedAt: new Date(),
        errorMessage: null,
      },
    });

    const retention = await getEffectiveRetentionCount(prisma);
    await applyBackupRetention(prisma, storage, retention);

    await notifyAdmins(prisma, 'backup-succeeded', {
      backupRunId,
      sizeBytes: archiveStat.size,
      destinationName: destination?.name ?? null,
      remotePath,
    });

    if (payload.mode === 'pre_update') {
      await enqueueJob('maintenance.apply-update', { updateRunId: payload.updateRunId });
    }

    logger.info({ backupRunId, sizeBytes: archiveStat.size }, 'Operational backup completed');
  } catch (error) {
    if (backupRunId) {
      await failRun(prisma, backupRunId, error, logger);
    } else {
      logger.error({ error }, 'Operational backup failed before run record');
    }
    throw error;
  } finally {
    if (backupRunId) {
      await releaseMaintenanceLockIfOwned(prisma, {
        reason: 'backup',
        runId: backupRunId,
      }).catch(() => undefined);
    }
    await refreshMaintenanceLiveState(prisma);
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export async function isMinioAvailableForBackup(): Promise<boolean> {
  try {
    const storage = await initStorage();
    if (!storage) return false;
    return storage.isAvailable();
  } catch {
    return false;
  }
}
