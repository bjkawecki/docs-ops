import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { runWatchSystemUpdate } from '../../domains/admin/services/adminSystemUpdateWatchService.js';
import * as updaterSidecarClient from '../updater/updaterSidecarClient.js';
import * as applyService from '../../domains/admin/services/adminSystemUpdateApplyService.js';
import * as appVersion from '../appVersion.js';

vi.mock('../updater/updaterSidecarClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof updaterSidecarClient>();
  return {
    ...actual,
    getSidecarUpdateStatus: vi.fn(),
    getUpdateApplyTimeoutSeconds: vi.fn(() => 60),
  };
});

vi.mock('../../domains/admin/services/adminSystemUpdateApplyService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof applyService>();
  return {
    ...actual,
    failUpdateRun: vi.fn(),
    completeUpdateRunSuccess: vi.fn(),
  };
});

vi.mock('../appVersion.js', () => ({
  resolveAppVersion: vi.fn(() => '0.1.0'),
}));

describe('runWatchSystemUpdate', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const updateRun = {
    id: 'run-1',
    status: 'applying' as const,
    targetVersion: '0.1.1',
    targetReleaseTag: 'v0.1.1',
    startedAt: new Date(),
    createdAt: new Date(),
  };

  const prisma = {
    updateRun: {
      findUnique: vi.fn().mockResolvedValue(updateRun),
    },
  } as unknown as PrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.updateRun.findUnique).mockResolvedValue(updateRun as never);
    vi.mocked(appVersion.resolveAppVersion).mockReturnValue('0.1.0');
  });

  it('fails update run when sidecar reports non-zero exit code', async () => {
    vi.mocked(updaterSidecarClient.getSidecarUpdateStatus).mockResolvedValue({
      running: false,
      version: 'v0.1.1',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      exitCode: 1,
      error: 'compose pull failed',
      containerName: 'docsops-update-run',
      containerLogTail: null,
    });

    await runWatchSystemUpdate(prisma, { updateRunId: 'run-1' }, logger);

    expect(applyService.failUpdateRun).toHaveBeenCalledWith(prisma, 'run-1', 'compose pull failed');
  });

  it('completes update run when installed version matches target', async () => {
    vi.mocked(appVersion.resolveAppVersion).mockReturnValue('0.1.1');
    vi.mocked(updaterSidecarClient.getSidecarUpdateStatus).mockResolvedValue({
      running: false,
      version: 'v0.1.1',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      exitCode: 0,
      error: null,
      containerName: 'docsops-update-run',
      containerLogTail: null,
    });

    await runWatchSystemUpdate(prisma, { updateRunId: 'run-1' }, logger);

    expect(applyService.completeUpdateRunSuccess).toHaveBeenCalledWith(prisma, 'run-1');
  });
});
