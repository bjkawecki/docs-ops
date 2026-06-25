import type { PrismaClient } from '../../../generated/prisma/client.js';
import { reconcileFailedPreUpdateBackups } from './reconcileFailedPreUpdateBackups.js';
import {
  isBackupRunActivelyRunning,
  isPlatformExportRunActivelyRunning,
  isPlatformImportRunActivelyRunning,
  isRestoreRunActivelyRunning,
} from './maintenanceRunActivity.js';

const MAINTENANCE_LOCK_ID = 'backup';

export const IN_PROGRESS_BACKUP_STATUSES = ['queued', 'running', 'uploading'] as const;
export const IN_PROGRESS_RESTORE_STATUSES = [
  'queued',
  'running',
  'validating',
  'restoring_db',
  'restoring_minio',
] as const;
export const IN_PROGRESS_PLATFORM_EXPORT_STATUSES = ['queued', 'running', 'packaging'] as const;
export const IN_PROGRESS_PLATFORM_IMPORT_STATUSES = [
  'queued',
  'running',
  'importing_organization',
  'importing_users',
  'importing_owners',
  'importing_contexts',
  'importing_documents',
  'importing_versions',
  'importing_tags',
  'importing_grants',
  'importing_pins',
  'importing_comments',
  'importing_suggestions',
  'importing_files',
] as const;
export const IN_PROGRESS_UPDATE_STATUSES = ['queued', 'backing_up', 'applying'] as const;

export type MaintenanceReason = 'backup' | 'restore' | 'platform-import' | 'update';

export type MaintenanceLockInfo = {
  active: boolean;
  reason?: string;
  backupRunId?: string | null;
  restoreRunId?: string | null;
  platformImportRunId?: string | null;
  updateRunId?: string | null;
  lockedAt?: Date;
};

function lockBusyMessage(reason: string | undefined): string {
  if (reason === 'restore') return 'A restore is already in progress';
  if (reason === 'platform-import') return 'A platform import is already in progress';
  if (reason === 'update') return 'A system update is already in progress';
  return 'A backup is already in progress';
}

type MaintenanceConflictDb = Pick<
  PrismaClient,
  | 'backupRun'
  | 'restoreRun'
  | 'platformExportRun'
  | 'platformImportRun'
  | 'updateRun'
  | 'systemMaintenanceLock'
>;

async function findConflictingMaintenanceRun(
  prisma: MaintenanceConflictDb,
  args: {
    reason: MaintenanceReason;
    backupRunId?: string;
    restoreRunId?: string;
    platformImportRunId?: string;
    platformExportRunId?: string;
    updateRunId?: string;
  }
): Promise<void> {
  const [
    inProgressBackups,
    inProgressRestores,
    inProgressExports,
    inProgressImports,
    inProgressUpdates,
  ] = await Promise.all([
    prisma.backupRun.findMany({
      where: { status: { in: [...IN_PROGRESS_BACKUP_STATUSES] } },
      select: { id: true, pgBossJobId: true },
    }),
    prisma.restoreRun.findMany({
      where: { status: { in: [...IN_PROGRESS_RESTORE_STATUSES] } },
      select: { id: true, pgBossJobId: true },
    }),
    prisma.platformExportRun.findMany({
      where: { status: { in: [...IN_PROGRESS_PLATFORM_EXPORT_STATUSES] } },
      select: { id: true, pgBossJobId: true },
    }),
    prisma.platformImportRun.findMany({
      where: { status: { in: [...IN_PROGRESS_PLATFORM_IMPORT_STATUSES] } },
      select: { id: true, pgBossJobId: true },
    }),
    prisma.updateRun.findMany({
      where: { status: { in: [...IN_PROGRESS_UPDATE_STATUSES] } },
      select: { id: true },
    }),
  ]);

  for (const backup of inProgressBackups) {
    if (backup.id === args.backupRunId) continue;
    if (await isBackupRunActivelyRunning(prisma, backup)) {
      throw new Error('A backup is already in progress');
    }
  }

  for (const restore of inProgressRestores) {
    if (restore.id === args.restoreRunId) continue;
    if (await isRestoreRunActivelyRunning(prisma, restore)) {
      throw new Error('A restore is already in progress');
    }
  }

  for (const exportRun of inProgressExports) {
    if (exportRun.id === args.platformExportRunId) continue;
    if (await isPlatformExportRunActivelyRunning(prisma, exportRun)) {
      throw new Error('A platform export is already in progress');
    }
  }

  for (const importRun of inProgressImports) {
    if (importRun.id === args.platformImportRunId) continue;
    if (await isPlatformImportRunActivelyRunning(prisma, importRun)) {
      throw new Error('A platform import is already in progress');
    }
  }

  for (const updateRun of inProgressUpdates) {
    if (updateRun.id === args.updateRunId) continue;
    throw new Error('A system update is already in progress');
  }
}

export type PublicMaintenanceStatus = {
  active: boolean;
  reason?: 'backup' | 'restore' | 'platform-import' | 'update';
  startedAt?: string;
};

function toIsoStartedAt(date: Date | null | undefined): string | undefined {
  if (date == null) return undefined;
  return date.toISOString();
}

async function resolvePreUpdateBackupContext(
  prisma: PrismaClient,
  backupRunId: string
): Promise<{ isPreUpdate: boolean; startedAt?: string }> {
  const backup = await prisma.backupRun.findUnique({
    where: { id: backupRunId },
    select: { triggerSource: true, startedAt: true, createdAt: true },
  });
  if (backup?.triggerSource !== 'pre_update') {
    return {
      isPreUpdate: false,
      startedAt: toIsoStartedAt(backup?.startedAt ?? backup?.createdAt),
    };
  }
  return {
    isPreUpdate: true,
    startedAt: toIsoStartedAt(backup.startedAt ?? backup.createdAt),
  };
}

export async function getPublicMaintenanceStatus(
  prisma: PrismaClient
): Promise<PublicMaintenanceStatus> {
  await reconcileFailedPreUpdateBackups(prisma);

  const lock = await getMaintenanceLock(prisma);
  if (lock.active) {
    const lockStartedAt = toIsoStartedAt(lock.lockedAt);
    if (lock.reason === 'restore') {
      return { active: true, reason: 'restore', startedAt: lockStartedAt };
    }
    if (lock.reason === 'platform-import') {
      return { active: true, reason: 'platform-import', startedAt: lockStartedAt };
    }
    if (lock.reason === 'update') {
      return { active: true, reason: 'update', startedAt: lockStartedAt };
    }
    if (lock.reason === 'backup' && lock.backupRunId) {
      const preUpdate = await resolvePreUpdateBackupContext(prisma, lock.backupRunId);
      if (preUpdate.isPreUpdate) {
        return { active: true, reason: 'update', startedAt: preUpdate.startedAt ?? lockStartedAt };
      }
      return { active: true, reason: 'backup', startedAt: preUpdate.startedAt ?? lockStartedAt };
    }
    return { active: true, reason: 'backup', startedAt: lockStartedAt };
  }

  const [
    inProgressRestores,
    inProgressImports,
    inProgressBackups,
    inProgressExports,
    inProgressUpdates,
  ] = await Promise.all([
    prisma.restoreRun.findMany({
      where: { status: { in: [...IN_PROGRESS_RESTORE_STATUSES] } },
      select: { id: true, pgBossJobId: true, startedAt: true, createdAt: true },
    }),
    prisma.platformImportRun.findMany({
      where: { status: { in: [...IN_PROGRESS_PLATFORM_IMPORT_STATUSES] } },
      select: { id: true, pgBossJobId: true, startedAt: true, createdAt: true },
    }),
    prisma.backupRun.findMany({
      where: { status: { in: [...IN_PROGRESS_BACKUP_STATUSES] } },
      select: {
        id: true,
        pgBossJobId: true,
        triggerSource: true,
        startedAt: true,
        createdAt: true,
      },
    }),
    prisma.platformExportRun.findMany({
      where: { status: { in: [...IN_PROGRESS_PLATFORM_EXPORT_STATUSES] } },
      select: { id: true, pgBossJobId: true, startedAt: true, createdAt: true },
    }),
    prisma.updateRun.findMany({
      where: { status: { in: [...IN_PROGRESS_UPDATE_STATUSES] } },
      select: { id: true, startedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  for (const restore of inProgressRestores) {
    if (await isRestoreRunActivelyRunning(prisma, restore)) {
      return {
        active: true,
        reason: 'restore',
        startedAt: toIsoStartedAt(restore.startedAt ?? restore.createdAt),
      };
    }
  }
  for (const importRun of inProgressImports) {
    if (await isPlatformImportRunActivelyRunning(prisma, importRun)) {
      return {
        active: true,
        reason: 'platform-import',
        startedAt: toIsoStartedAt(importRun.startedAt ?? importRun.createdAt),
      };
    }
  }
  for (const backup of inProgressBackups) {
    if (await isBackupRunActivelyRunning(prisma, backup)) {
      if (backup.triggerSource === 'pre_update') {
        return {
          active: true,
          reason: 'update',
          startedAt: toIsoStartedAt(backup.startedAt ?? backup.createdAt),
        };
      }
      return {
        active: true,
        reason: 'backup',
        startedAt: toIsoStartedAt(backup.startedAt ?? backup.createdAt),
      };
    }
  }
  for (const exportRun of inProgressExports) {
    if (await isPlatformExportRunActivelyRunning(prisma, exportRun)) {
      return {
        active: true,
        reason: 'backup',
        startedAt: toIsoStartedAt(exportRun.startedAt ?? exportRun.createdAt),
      };
    }
  }
  if (inProgressUpdates.length > 0) {
    const run = inProgressUpdates[0];
    if (run) {
      return {
        active: true,
        reason: 'update',
        startedAt: toIsoStartedAt(run.startedAt ?? run.createdAt),
      };
    }
  }

  return { active: false };
}

export async function getMaintenanceLock(prisma: PrismaClient): Promise<MaintenanceLockInfo> {
  const row = await prisma.systemMaintenanceLock.findUnique({ where: { id: MAINTENANCE_LOCK_ID } });
  if (!row) return { active: false };
  return {
    active: true,
    reason: row.reason,
    backupRunId: row.backupRunId,
    restoreRunId: row.restoreRunId,
    platformImportRunId: row.platformImportRunId,
    updateRunId: row.updateRunId,
    lockedAt: row.lockedAt,
  };
}

export async function assertMaintenanceAvailable(prisma: PrismaClient): Promise<void> {
  const lock = await getMaintenanceLock(prisma);
  if (lock.active) {
    throw new Error(lockBusyMessage(lock.reason));
  }
  await findConflictingMaintenanceRun(prisma, { reason: 'backup' });
}

export async function tryAcquireMaintenanceLock(
  prisma: PrismaClient,
  args: {
    reason: MaintenanceReason;
    backupRunId?: string;
    restoreRunId?: string;
    platformImportRunId?: string;
    platformExportRunId?: string;
    updateRunId?: string;
  }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.systemMaintenanceLock.findUnique({
      where: { id: MAINTENANCE_LOCK_ID },
    });
    if (existing) {
      throw new Error(lockBusyMessage(existing.reason));
    }

    await findConflictingMaintenanceRun(tx, args);

    await tx.systemMaintenanceLock.create({
      data: {
        id: MAINTENANCE_LOCK_ID,
        reason: args.reason,
        backupRunId: args.backupRunId ?? null,
        restoreRunId: args.restoreRunId ?? null,
        platformImportRunId: args.platformImportRunId ?? null,
        updateRunId: args.updateRunId ?? null,
      },
    });
  });
}

/** @deprecated Use tryAcquireMaintenanceLock */
export async function acquireBackupMaintenanceLock(
  prisma: PrismaClient,
  backupRunId: string
): Promise<void> {
  await tryAcquireMaintenanceLock(prisma, { reason: 'backup', backupRunId });
}

/** @deprecated Use tryAcquireMaintenanceLock */
export async function acquireRestoreMaintenanceLock(
  prisma: PrismaClient,
  restoreRunId: string
): Promise<void> {
  await tryAcquireMaintenanceLock(prisma, { reason: 'restore', restoreRunId });
}

export async function releaseMaintenanceLockIfOwned(
  prisma: PrismaClient,
  args: { reason: MaintenanceReason; runId: string }
): Promise<void> {
  await prisma.systemMaintenanceLock.deleteMany({
    where: {
      id: MAINTENANCE_LOCK_ID,
      reason: args.reason,
      ...(args.reason === 'backup'
        ? { backupRunId: args.runId }
        : args.reason === 'restore'
          ? { restoreRunId: args.runId }
          : args.reason === 'update'
            ? { updateRunId: args.runId }
            : { platformImportRunId: args.runId }),
    },
  });
}

export async function releaseMaintenanceLock(prisma: PrismaClient): Promise<void> {
  await prisma.systemMaintenanceLock.deleteMany({ where: { id: MAINTENANCE_LOCK_ID } });
}

/** @deprecated Use releaseMaintenanceLockIfOwned */
export async function releaseBackupMaintenanceLock(prisma: PrismaClient): Promise<void> {
  await releaseMaintenanceLock(prisma);
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Paths that may mutate during backup/restore/platform migration/update maintenance. */
function isMaintenanceExemptPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  if (path === '/api/v1/auth/login' || path === '/api/v1/auth/logout') return true;
  if (path.startsWith('/api/v1/admin/backups')) return true;
  if (path.startsWith('/api/v1/admin/backup-destinations')) return true;
  if (path.startsWith('/api/v1/admin/restores')) return true;
  if (path.startsWith('/api/v1/admin/platform-exports')) return true;
  if (path.startsWith('/api/v1/admin/platform-imports')) return true;
  if (path.startsWith('/api/v1/admin/updates')) return true;
  return false;
}

export function shouldBlockForMaintenance(method: string, url: string): boolean {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return false;
  if (isMaintenanceExemptPath(url)) return false;
  return true;
}
