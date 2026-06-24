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

function mockGithubUpdateFetch(options: {
  latestTag: string;
  releaseNotes?: string;
  releaseNotesMissing?: boolean;
}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('api.github.com/repos') && url.includes('/releases/latest')) {
      const tag = options.latestTag;
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
      if (options.releaseNotesMissing) {
        return Promise.resolve(new Response('Not found', { status: 404 }));
      }
      return Promise.resolve(
        new Response(options.releaseNotes ?? '# Upcoming release\n\n### Features\n\n- Item', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      );
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
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
    mockGithubUpdateFetch({ latestTag: 'v0.2.0' });
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
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
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
    mockGithubUpdateFetch({
      latestTag: 'v99.0.0',
      releaseNotes: '# v99\n\n### Features\n\n- Big change\n\n## For operators\n\n- Backup',
    });
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
      upcomingReleaseNotesVersion: string | null;
      upcomingReleaseNotesMarkdown: string | null;
      upcomingReleaseNotesError: string | null;
    };
    expect(body.updateCheckEnabled).toBe(true);
    expect(body.latestVersion).toBe('99.0.0');
    expect(body.updateAvailable).toBe(true);
    expect(body.releaseUrl).toContain('github.com');
    expect(body.upcomingReleaseNotesVersion).toBe('99.0.0');
    expect(body.upcomingReleaseNotesMarkdown).toContain('For operators');
    expect(body.upcomingReleaseNotesError).toBeNull();
  });

  it('GET /admin/system/update-status does not fetch release notes when up to date', async () => {
    process.env.DOCSOPS_UPDATE_GITHUB_REPO = 'bjkawecki/docs-ops';
    const fetchSpy = mockGithubUpdateFetch({ latestTag: 'v0.1.0' });
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/update-status',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      updateAvailable: boolean;
      upcomingReleaseNotesVersion: string | null;
      upcomingReleaseNotesMarkdown: string | null;
    };
    expect(body.updateAvailable).toBe(false);
    expect(body.upcomingReleaseNotesVersion).toBeNull();
    expect(body.upcomingReleaseNotesMarkdown).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('GET /admin/system/update-status sets notes error when markdown fetch fails', async () => {
    process.env.DOCSOPS_UPDATE_GITHUB_REPO = 'bjkawecki/docs-ops';
    mockGithubUpdateFetch({ latestTag: 'v99.0.0', releaseNotesMissing: true });
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/system/update-status',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      updateAvailable: boolean;
      upcomingReleaseNotesVersion: string | null;
      upcomingReleaseNotesError: string | null;
    };
    expect(body.updateAvailable).toBe(true);
    expect(body.upcomingReleaseNotesVersion).toBe('99.0.0');
    expect(body.upcomingReleaseNotesError).toContain('not found');
  });

  it('POST /admin/system/check-updates returns status for admin', async () => {
    process.env.DOCSOPS_UPDATE_GITHUB_REPO = 'bjkawecki/docs-ops';
    mockGithubUpdateFetch({
      latestTag: 'v99.0.0',
      releaseNotes: '# v99\n\n### Features\n\n- Big change\n\n## For operators\n\n- Backup',
    });
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
