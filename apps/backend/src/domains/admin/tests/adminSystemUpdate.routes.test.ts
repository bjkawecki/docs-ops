import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Prisma } from '../../../../generated/prisma/client.js';
import { buildApp } from '../../../app.js';
import { prisma } from '../../../db.js';
import { hashPassword } from '../../auth/services/password.js';
import {
  DEFAULT_UPDATE_GITHUB_REPO,
  getUpdateCheckGithubRepo,
  resetAdminSystemUpdateCacheForTests,
} from '../services/adminSystemUpdateService.js';

const TS = Date.now();
const ADMIN_EMAIL = `sysupdate-admin-${TS}@example.com`;
const NORMAL_EMAIL = `sysupdate-normal-${TS}@example.com`;
const PASSWORD = 'testpass123';

function getCookieHeader(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  if (Array.isArray(setCookie)) return setCookie.join('; ');
  if (typeof setCookie === 'string') return setCookie;
  return '';
}

describe('Admin system update routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminId: string;
  let previousRepo: string | undefined;

  beforeAll(async () => {
    previousRepo = process.env.DOCSOPS_UPDATE_GITHUB_REPO;
    app = await buildApp();
    const passwordHash = await hashPassword(PASSWORD);
    const [admin, normal] = await Promise.all([
      prisma.user.create({
        data: { name: 'Update Admin', email: ADMIN_EMAIL, passwordHash, isAdmin: true },
      }),
      prisma.user.create({
        data: { name: 'Update Normal', email: NORMAL_EMAIL, passwordHash, isAdmin: false },
      }),
    ]);
    adminId = admin.id;
    void normal;
  });

  afterAll(async () => {
    if (previousRepo === undefined) {
      delete process.env.DOCSOPS_UPDATE_GITHUB_REPO;
    } else {
      process.env.DOCSOPS_UPDATE_GITHUB_REPO = previousRepo;
    }
    await prisma.systemSettings.deleteMany({ where: { id: 'default' } });
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM user_notification WHERE user_id = ${adminId} AND event_type = 'update-available'`
    );
    await prisma.session.deleteMany({ where: { userId: adminId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.user.deleteMany({ where: { email: NORMAL_EMAIL } });
    await app?.close();
  });

  beforeEach(async () => {
    resetAdminSystemUpdateCacheForTests();
    vi.restoreAllMocks();
    await prisma.systemSettings.deleteMany({ where: { id: 'default' } });
  });

  async function loginAs(email: string, password: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(204);
    return getCookieHeader(res);
  }

  it('GET /admin/system/update-status returns 401 without session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/system/update-status' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /admin/system/update-status returns 403 for non-admin', async () => {
    const cookie = await loginAs(NORMAL_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/update-status',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /admin/system/update-status uses default repo when env is missing', async () => {
    delete process.env.DOCSOPS_UPDATE_GITHUB_REPO;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: 'v0.2.0',
          html_url: 'https://github.com/bjkawecki/docs-ops/releases/tag/v0.2.0',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/update-status',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      updateCheckEnabled: boolean;
      updateCheckConfigured: boolean;
      githubRepo: string;
      latestVersion: string;
    };
    expect(body.updateCheckEnabled).toBe(true);
    expect(body.updateCheckConfigured).toBe(true);
    expect(body.githubRepo).toBe(DEFAULT_UPDATE_GITHUB_REPO);
    expect(body.latestVersion).toBe('0.2.0');
    expect(getUpdateCheckGithubRepo()).toBe(DEFAULT_UPDATE_GITHUB_REPO);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('GET /admin/system/update-status disables check when admin toggle is off', async () => {
    delete process.env.DOCSOPS_UPDATE_GITHUB_REPO;
    await prisma.systemSettings.create({
      data: { id: 'default', updateCheckEnabled: false },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/update-status',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      updateCheckEnabled: boolean;
      updateCheckConfigured: boolean;
      githubRepo: string;
      updateAvailable: boolean;
    };
    expect(body.updateCheckEnabled).toBe(false);
    expect(body.updateCheckConfigured).toBe(false);
    expect(body.githubRepo).toBe(DEFAULT_UPDATE_GITHUB_REPO);
    expect(body.updateAvailable).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('GET /admin/system/update-status reports updateAvailable from GitHub latest', async () => {
    process.env.DOCSOPS_UPDATE_GITHUB_REPO = 'bjkawecki/docs-ops';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: 'v99.0.0',
          html_url: 'https://github.com/bjkawecki/docs-ops/releases/tag/v99.0.0',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/update-status',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      updateCheckEnabled: boolean;
      latestVersion: string;
      updateAvailable: boolean;
      releaseUrl: string;
    };
    expect(body.updateCheckEnabled).toBe(true);
    expect(body.latestVersion).toBe('99.0.0');
    expect(body.updateAvailable).toBe(true);
    expect(body.releaseUrl).toContain('github.com');
  });

  it('POST /admin/system/check-updates returns status for admin', async () => {
    process.env.DOCSOPS_UPDATE_GITHUB_REPO = 'bjkawecki/docs-ops';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: 'v99.0.0',
          html_url: 'https://github.com/bjkawecki/docs-ops/releases/tag/v99.0.0',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/system/check-updates',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: { updateAvailable: boolean }; notificationSent: boolean };
    expect(body.status.updateAvailable).toBe(true);
    expect(typeof body.notificationSent).toBe('boolean');
  });

  it('GET /admin/system/settings returns defaults for admin', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/settings',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { updateCheckEnabled: boolean; updatedAt: string };
    expect(body.updateCheckEnabled).toBe(true);
    expect(body.updatedAt).toBeTruthy();
  });

  it('PATCH /admin/system/settings toggles update check for admin', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/system/settings',
      headers: { cookie },
      payload: { updateCheckEnabled: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { updateCheckEnabled: boolean };
    expect(body.updateCheckEnabled).toBe(false);

    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/update-status',
      headers: { cookie },
    });
    const status = statusRes.json() as { updateCheckEnabled: boolean };
    expect(status.updateCheckEnabled).toBe(false);
  });

  it('GET /admin/system/settings returns 403 for non-admin', async () => {
    const cookie = await loginAs(NORMAL_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/settings',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });
});
