import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { reconcileUpdateRunsOnStartup } from './reconcileUpdateRunsOnStartup.js';
import * as hostAgentClient from '../agent/hostAgentClient.js';
import * as applyService from '../../domains/admin/services/adminSystemUpdateApplyService.js';
import * as appVersion from '../appVersion.js';

vi.mock('../agent/hostAgentClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof hostAgentClient>();
  return {
    ...actual,
    getAgentUpdateStatus: vi.fn(),
    getUpdateApplyTimeoutSeconds: vi.fn(() => 600),
    isAgentConfigured: vi.fn(() => true),
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

vi.mock('./reconcileFailedPreUpdateBackups.js', () => ({
  reconcileFailedPreUpdateBackups: vi.fn(),
}));

vi.mock('./maintenanceModeService.js', () => ({
  releaseMaintenanceLockIfOwned: vi.fn(),
}));

vi.mock('../liveEvents/refreshMaintenanceLiveState.js', () => ({
  refreshMaintenanceLiveState: vi.fn(),
}));

vi.mock('../appVersion.js', () => ({
  resolveAppVersion: vi.fn(() => '1.0.0'),
}));

describe('reconcileUpdateRunsOnStartup agent fallback', () => {
  const applyingRun = {
    id: 'run-1',
    status: 'applying' as const,
    targetVersion: '1.0.0',
    targetReleaseTag: 'v1.0.0',
    startedAt: new Date(),
    createdAt: new Date(),
  };

  const prisma = {
    updateRun: {
      findMany: vi.fn(({ where }: { where: { status: string | { in: string[] } } }) => {
        if (where.status === 'applying') {
          return Promise.resolve([applyingRun]);
        }
        return Promise.resolve([]);
      }),
      findUnique: vi.fn(),
    },
    systemMaintenanceLock: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(appVersion.resolveAppVersion).mockReturnValue('0.9.0');
  });

  it('fails applying run when agent reports non-zero exit code', async () => {
    vi.mocked(hostAgentClient.getAgentUpdateStatus).mockResolvedValue({
      running: false,
      version: 'v1.0.0',
      phase: 'failed',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      exitCode: 1,
      error: 'compose pull failed',
      errorCode: 'COMPOSE_PULL_FAILED',
      logTail: null,
    });

    await reconcileUpdateRunsOnStartup(prisma);

    expect(applyService.failUpdateRun).toHaveBeenCalledWith(prisma, 'run-1', 'compose pull failed');
  });
});
