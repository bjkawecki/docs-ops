import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../db.js';
import {
  assertMaintenanceAvailable,
  getMaintenanceLock,
  releaseMaintenanceLockIfOwned,
  tryAcquireMaintenanceLock,
} from './maintenanceModeService.js';

describe('maintenanceModeService', () => {
  beforeEach(async () => {
    await prisma.systemMaintenanceLock.deleteMany({ where: { id: 'backup' } });
    await prisma.restoreRun.deleteMany({});
    await prisma.backupRun.deleteMany({});
    await prisma.updateRun.deleteMany({});
  });

  afterEach(async () => {
    await prisma.systemMaintenanceLock.deleteMany({ where: { id: 'backup' } });
    await prisma.restoreRun.deleteMany({});
    await prisma.backupRun.deleteMany({});
    await prisma.updateRun.deleteMany({});
  });

  it('tryAcquireMaintenanceLock fails when lock already held', async () => {
    await tryAcquireMaintenanceLock(prisma, {
      reason: 'restore',
      restoreRunId: 'restore-1',
    });

    await expect(
      tryAcquireMaintenanceLock(prisma, { reason: 'backup', backupRunId: 'backup-1' })
    ).rejects.toThrow('A restore is already in progress');
  });

  it('tryAcquireMaintenanceLock fails when another backup run is actively running', async () => {
    await prisma.backupRun.create({
      data: { id: 'backup-a', status: 'running', triggerSource: 'manual' },
    });
    await prisma.systemMaintenanceLock.create({
      data: { id: 'backup', reason: 'backup', backupRunId: 'backup-a' },
    });

    await expect(
      tryAcquireMaintenanceLock(prisma, { reason: 'backup', backupRunId: 'backup-b' })
    ).rejects.toThrow('A backup is already in progress');
  });

  it('assertMaintenanceAvailable allows restore when backup run is stale (no lock, no job)', async () => {
    await prisma.backupRun.create({
      data: { id: 'backup-stale', status: 'running', triggerSource: 'manual' },
    });

    await expect(assertMaintenanceAvailable(prisma)).resolves.toBeUndefined();
  });

  it('tryAcquireMaintenanceLock allows restore when backup run row is stale', async () => {
    await prisma.backupRun.create({
      data: { id: 'backup-stale', status: 'running', triggerSource: 'manual' },
    });

    await tryAcquireMaintenanceLock(prisma, { reason: 'restore', restoreRunId: 'restore-1' });
    const lock = await getMaintenanceLock(prisma);
    expect(lock.reason).toBe('restore');
  });

  it('tryAcquireMaintenanceLock allows own queued backup run', async () => {
    await prisma.backupRun.create({
      data: { id: 'backup-a', status: 'queued', triggerSource: 'manual' },
    });

    await tryAcquireMaintenanceLock(prisma, { reason: 'backup', backupRunId: 'backup-a' });
    const lock = await getMaintenanceLock(prisma);
    expect(lock.active).toBe(true);
    expect(lock.reason).toBe('backup');
    expect(lock.backupRunId).toBe('backup-a');
  });

  it('tryAcquireMaintenanceLock allows pre-update backup when paired update run is backing up', async () => {
    await prisma.backupRun.create({
      data: { id: 'backup-pre', status: 'queued', triggerSource: 'pre_update' },
    });
    await prisma.updateRun.create({
      data: {
        id: 'update-1',
        status: 'backing_up',
        targetVersion: '0.1.1',
        targetReleaseTag: 'v0.1.1',
        backupRunId: 'backup-pre',
      },
    });

    await tryAcquireMaintenanceLock(prisma, {
      reason: 'backup',
      backupRunId: 'backup-pre',
      updateRunId: 'update-1',
    });
    const lock = await getMaintenanceLock(prisma);
    expect(lock.active).toBe(true);
    expect(lock.reason).toBe('backup');
    expect(lock.backupRunId).toBe('backup-pre');
  });

  it('tryAcquireMaintenanceLock rejects pre-update backup without paired updateRunId', async () => {
    await prisma.backupRun.create({
      data: { id: 'backup-pre', status: 'queued', triggerSource: 'pre_update' },
    });
    await prisma.updateRun.create({
      data: {
        id: 'update-1',
        status: 'backing_up',
        targetVersion: '0.1.1',
        targetReleaseTag: 'v0.1.1',
        backupRunId: 'backup-pre',
      },
    });

    await expect(
      tryAcquireMaintenanceLock(prisma, { reason: 'backup', backupRunId: 'backup-pre' })
    ).rejects.toThrow('A system update is already in progress');
  });

  it('releaseMaintenanceLockIfOwned only clears matching run', async () => {
    await tryAcquireMaintenanceLock(prisma, { reason: 'restore', restoreRunId: 'restore-1' });

    await releaseMaintenanceLockIfOwned(prisma, { reason: 'restore', runId: 'restore-other' });
    expect((await getMaintenanceLock(prisma)).active).toBe(true);

    await releaseMaintenanceLockIfOwned(prisma, { reason: 'restore', runId: 'restore-1' });
    expect((await getMaintenanceLock(prisma)).active).toBe(false);
  });

  it('assertMaintenanceAvailable rejects actively running restore', async () => {
    await prisma.restoreRun.create({
      data: { id: 'restore-a', status: 'queued', source: 'history' },
    });
    await prisma.systemMaintenanceLock.create({
      data: { id: 'backup', reason: 'restore', restoreRunId: 'restore-a' },
    });

    await expect(assertMaintenanceAvailable(prisma)).rejects.toThrow(
      'A restore is already in progress'
    );
  });
});
