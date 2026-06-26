import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { prisma } from '../../../db.js';
import { hashPassword } from '../../auth/services/password.js';
import {
  getUpdateCheckGithubRepo,
  resetAdminSystemUpdateCacheForTests,
} from '../services/adminSystemUpdateService.js';
import * as operationalBackupService from '../services/operationalBackupService.js';

const TS = Date.now();
const ADMIN_EMAIL = `updates-apply-admin-${TS}@example.com`;
const NORMAL_EMAIL = `updates-apply-normal-${TS}@example.com`;
const PASSWORD = 'testpass123';

function getCookieHeader(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  if (Array.isArray(setCookie)) return setCookie.join('; ');
  if (typeof setCookie === 'string') return setCookie;
  return '';
}

function mockGithubLatest(tag: string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('api.github.com/repos') && url.includes('/releases/latest')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            tag_name: tag,
            html_url: `https://github.com/bjkawecki/docs-ops/releases/tag/${tag}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
    if (url.includes('raw.githubusercontent.com')) {
      return Promise.resolve(
        new Response('# Notes', { status: 200, headers: { 'Content-Type': 'text/plain' } })
      );
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('Admin updates apply routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminId: string;
  let prevRepo: string | undefined;
  let prevAgentUrl: string | undefined;
  let prevAgentToken: string | undefined;
  let prevBackupKey: string | undefined;

  beforeAll(async () => {
    prevRepo = process.env.DOCSOPS_UPDATE_GITHUB_REPO;
    prevAgentUrl = process.env.DOCSOPS_AGENT_URL;
    prevAgentToken = process.env.DOCSOPS_AGENT_TOKEN;
    prevBackupKey = process.env.BACKUP_ENCRYPTION_KEY;
    process.env.BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    process.env.DOCSOPS_AGENT_URL = 'http://host.docker.internal:8091';
    process.env.DOCSOPS_AGENT_TOKEN = 'test-agent-token';

    app = await buildApp();
    const passwordHash = await hashPassword(PASSWORD);
    const [admin, normal] = await Promise.all([
      prisma.user.create({
        data: { name: 'Apply Admin', email: ADMIN_EMAIL, passwordHash, isAdmin: true },
      }),
      prisma.user.create({
        data: { name: 'Apply Normal', email: NORMAL_EMAIL, passwordHash, isAdmin: false },
      }),
    ]);
    adminId = admin.id;
    void normal;
  });

  afterAll(async () => {
    if (prevRepo === undefined) delete process.env.DOCSOPS_UPDATE_GITHUB_REPO;
    else process.env.DOCSOPS_UPDATE_GITHUB_REPO = prevRepo;
    if (prevAgentUrl === undefined) delete process.env.DOCSOPS_AGENT_URL;
    else process.env.DOCSOPS_AGENT_URL = prevAgentUrl;
    if (prevAgentToken === undefined) delete process.env.DOCSOPS_AGENT_TOKEN;
    else process.env.DOCSOPS_AGENT_TOKEN = prevAgentToken;
    if (prevBackupKey === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
    else process.env.BACKUP_ENCRYPTION_KEY = prevBackupKey;
    await app.close();
  });

  beforeEach(async () => {
    resetAdminSystemUpdateCacheForTests();
    vi.restoreAllMocks();
    await prisma.updateRun.deleteMany();
    await prisma.backupRun.deleteMany({ where: { triggerSource: 'pre_update' } });
    await prisma.systemMaintenanceLock.deleteMany();
  });

  async function loginAs(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    return getCookieHeader(res);
  }

  it('POST /admin/updates/apply returns 403 for non-admin', async () => {
    const cookie = await loginAs(NORMAL_EMAIL);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/updates/apply',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /admin/updates/apply returns 409 when no update available', async () => {
    process.env.DOCSOPS_UPDATE_GITHUB_REPO = 'bjkawecki/docs-ops';
    mockGithubLatest('v0.1.0');
    const cookie = await loginAs(ADMIN_EMAIL);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/updates/apply',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string };
    expect(body.error).toContain('No update');
  });

  it('POST /admin/updates/apply creates UpdateRun and enqueues pre_update backup', async () => {
    process.env.DOCSOPS_UPDATE_GITHUB_REPO = 'bjkawecki/docs-ops';
    mockGithubLatest('v99.0.0');
    vi.spyOn(operationalBackupService, 'isMinioAvailableForBackup').mockResolvedValue(true);

    const cookie = await loginAs(ADMIN_EMAIL);
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/update-status',
      headers: { cookie },
    });
    expect(statusRes.json()).toMatchObject({ canApplyUpdate: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/updates/apply',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json() as { updateRunId: string; status: string };
    expect(body.status).toBe('backing_up');

    const run = await prisma.updateRun.findUnique({ where: { id: body.updateRunId } });
    expect(run?.status).toBe('backing_up');
    expect(run?.targetVersion).toBe('99.0.0');
    expect(run?.triggeredByUserId).toBe(adminId);

    const backup = await prisma.backupRun.findUnique({ where: { id: run!.backupRunId! } });
    expect(backup?.triggerSource).toBe('pre_update');
    expect(backup?.pgBossJobId).toBeTruthy();
  });

  it('GET /admin/system/update-status includes agentConfigured and activeUpdateRun', async () => {
    process.env.DOCSOPS_UPDATE_GITHUB_REPO = 'bjkawecki/docs-ops';
    mockGithubLatest('v0.2.0');
    const cookie = await loginAs(ADMIN_EMAIL);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/update-status',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      agentConfigured: boolean;
      agentMissingEnvVars: string[];
      canApplyUpdate: boolean;
      activeUpdateRun: unknown;
    };
    expect(body.agentConfigured).toBe(true);
    expect(body.agentMissingEnvVars).toEqual([]);
    expect(body.activeUpdateRun).toBeNull();
    expect(typeof body.canApplyUpdate).toBe('boolean');
    expect(getUpdateCheckGithubRepo()).toBe('bjkawecki/docs-ops');
  });
});
