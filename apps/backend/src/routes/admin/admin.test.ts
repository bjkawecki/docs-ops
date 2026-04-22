import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { hashPassword } from '../../auth/password.js';
import { IMPERSONATE_COOKIE_NAME } from '../../auth/middleware.js';

const TS = Date.now();
const ADMIN_EMAIL = `admin-${TS}@example.com`;
const NORMAL_EMAIL = `normal-${TS}@example.com`;
const SSO_EMAIL = `sso-${TS}@example.com`;
const PASSWORD = 'testpass123';

function getCookieHeader(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  if (Array.isArray(setCookie)) return setCookie.join('; ');
  if (typeof setCookie === 'string') return setCookie;
  return '';
}

describe('Admin routes (GET/POST/PATCH /admin/users, reset-password)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminId: string;
  let normalUserId: string;
  let ssoUserId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    const passwordHash = await hashPassword(PASSWORD);
    const [admin, normal, sso] = await Promise.all([
      prisma.user.create({
        data: { name: 'Admin User', email: ADMIN_EMAIL, passwordHash, isAdmin: true },
      }),
      prisma.user.create({
        data: { name: 'Normal User', email: NORMAL_EMAIL, passwordHash, isAdmin: false },
      }),
      prisma.user.create({
        data: { name: 'SSO User', email: SSO_EMAIL, passwordHash: null, isAdmin: false },
      }),
    ]);
    adminId = admin.id;
    normalUserId = normal.id;
    ssoUserId = sso.id;
    // Ensure only our admin is admin so "last admin" checks pass. Exclude our 3 users so we don't
    // overwrite our admin; set all other users (e.g. from other test files) to isAdmin false.
    await prisma.user.updateMany({
      where: { id: { notIn: [adminId, normalUserId, ssoUserId] } },
      data: { isAdmin: false },
    });
  });

  afterAll(async () => {
    const allIds = [adminId, normalUserId, ssoUserId, ...createdUserIds].filter(
      (id): id is string => id != null
    );
    if (allIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: allIds } } });
      await prisma.user.deleteMany({ where: { id: { in: allIds } } });
    }
    await app?.close();
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

  it('GET /api/v1/admin/users ohne Cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/users' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/admin/users als Normalnutzer → 403', async () => {
    const cookie = await loginAs(NORMAL_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toContain('Administrator');
  });

  it('GET /api/v1/admin/users als Admin → 200 + items, total, limit, offset', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: { id: string }[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.limit).toBeDefined();
    expect(body.offset).toBeDefined();
    expect(body.items.some((u) => u.id === adminId)).toBe(true);
  });

  it('GET /api/v1/admin/users?includeDeactivated=true enthält deaktivierte Nutzer', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    await prisma.user.update({
      where: { id: normalUserId },
      data: { deletedAt: new Date() },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users?includeDeactivated=true&limit=50',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: { id: string; deletedAt: Date | null }[] };
    const normal = body.items.find((u) => u.id === normalUserId);
    expect(normal).toBeDefined();
    expect(normal!.deletedAt).not.toBeNull();
    await prisma.user.update({
      where: { id: normalUserId },
      data: { deletedAt: null },
    });
  });

  it('POST /api/v1/admin/users als Admin → 201, Nutzer angelegt', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const newEmail = `new-${TS}@example.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'New User', email: newEmail, password: 'password8', isAdmin: false },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      id: string;
      name: string;
      email: string;
      isAdmin: boolean;
      deletedAt: null;
    };
    expect(body.name).toBe('New User');
    expect(body.email).toBe(newEmail);
    expect(body.isAdmin).toBe(false);
    expect(body.deletedAt).toBeNull();
    createdUserIds.push(body.id);
  });

  it('POST /api/v1/admin/users mit doppelter E-Mail → 409', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Duplicate', email: ADMIN_EMAIL, password: 'password8', isAdmin: false },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string };
    expect(body.error).toContain('email');
  });

  it('PATCH /api/v1/admin/users/:userId als Admin (Name) → 200', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${normalUserId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Normal User Updated' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { name: string };
    expect(body.name).toBe('Normal User Updated');
    await prisma.user.update({ where: { id: normalUserId }, data: { name: 'Normal User' } });
  });

  it('PATCH letzter Admin isAdmin: false → 403', async () => {
    await prisma.user.updateMany({
      where: { id: { not: adminId } },
      data: { isAdmin: false },
    });
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${adminId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { isAdmin: false },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toContain('last');
  });

  it('PATCH letzter Admin deaktivieren (deletedAt) → 403', async () => {
    await prisma.user.updateMany({
      where: { id: { not: adminId } },
      data: { isAdmin: false },
    });
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${adminId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { deletedAt: new Date().toISOString() },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toContain('last');
  });

  it('PATCH E-Mail auf bereits vergebene → 409', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${normalUserId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { email: ADMIN_EMAIL },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string };
    expect(body.error).toContain('email');
  });

  it('POST /api/v1/admin/users/:userId/reset-password als Admin → 204', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${normalUserId}/reset-password`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { newPassword: 'newpass123' },
    });
    expect(res.statusCode).toBe(204);
    const canLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: NORMAL_EMAIL, password: 'newpass123' },
    });
    expect(canLogin.statusCode).toBe(204);
    await prisma.user.update({
      where: { id: normalUserId },
      data: { passwordHash: await hashPassword(PASSWORD) },
    });
  });

  it('POST reset-password für User ohne passwordHash (SSO) → 400', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${ssoUserId}/reset-password`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { newPassword: 'newpass123' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toContain('SSO');
  });

  it('POST reset-password als Normalnutzer → 403', async () => {
    const cookie = await loginAs(NORMAL_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${adminId}/reset-password`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { newPassword: 'otherpass8' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST reset-password für unbekannten User → 404', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const tempUser = await prisma.user.create({
      data: {
        name: 'Temp',
        email: `temp-404-${TS}@example.com`,
        passwordHash: await hashPassword('x'),
        isAdmin: false,
      },
    });
    const deletedId = tempUser.id;
    await prisma.user.delete({ where: { id: deletedId } });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${deletedId}/reset-password`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { newPassword: 'newpass123' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/v1/admin/jobs ohne Cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/jobs' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/admin/jobs/health als Admin → 200 oder 503 (queue-abhängig)', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/jobs/health',
      headers: { cookie },
    });
    expect([200, 503]).toContain(res.statusCode);
    const body = res.json() as { status?: string };
    expect(typeof body).toBe('object');
    expect(body.status).toBeDefined();
  });

  it('GET /api/v1/admin/companies/:id/stats für unbekannte Company → 404', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/companies/cmi1234567890123456789012/stats',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/v1/admin/departments/member-counts als Admin → 200 + Objekt', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/departments/member-counts',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, number>;
    expect(body).not.toBeNull();
    expect(typeof body).toBe('object');
  });

  describe('Impersonation', () => {
    it('POST /admin/impersonate als Admin → 204 + Set-Cookie, GET /me liefert Ziel-User + impersonation', async () => {
      const sessionCookie = await loginAs(ADMIN_EMAIL, PASSWORD);
      const impersonateRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/impersonate',
        headers: { cookie: sessionCookie, 'content-type': 'application/json' },
        payload: { userId: normalUserId },
      });
      expect(impersonateRes.statusCode).toBe(204);
      const setCookie = impersonateRes.headers['set-cookie'];
      const impersonateCookiePart =
        typeof setCookie === 'string'
          ? setCookie.split(';')[0]
          : Array.isArray(setCookie)
            ? setCookie[0]?.split(';')[0]
            : '';
      expect(impersonateCookiePart).toContain(IMPERSONATE_COOKIE_NAME);

      const meCookie = `${sessionCookie}; ${impersonateCookiePart}`;
      const meRes = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { cookie: meCookie },
      });
      expect(meRes.statusCode).toBe(200);
      const meBody = meRes.json() as {
        user: { id: string; name: string };
        impersonation?: { active: boolean; realUser: { id: string; name: string } };
      };
      expect(meBody.user.id).toBe(normalUserId);
      expect(meBody.user.name).toBe('Normal User');
      expect(meBody.impersonation).toBeDefined();
      expect(meBody.impersonation!.active).toBe(true);
      expect(meBody.impersonation!.realUser.id).toBe(adminId);
      expect(meBody.impersonation!.realUser.name).toBe('Admin User');
    });

    it('DELETE /admin/impersonate → 204, danach GET /me ohne Impersonation', async () => {
      const sessionCookie = await loginAs(ADMIN_EMAIL, PASSWORD);
      await app.inject({
        method: 'POST',
        url: '/api/v1/admin/impersonate',
        headers: { cookie: sessionCookie, 'content-type': 'application/json' },
        payload: { userId: normalUserId },
      });
      const stopRes = await app.inject({
        method: 'DELETE',
        url: '/api/v1/admin/impersonate',
        headers: { cookie: sessionCookie },
      });
      expect(stopRes.statusCode).toBe(204);

      const meRes = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { cookie: sessionCookie },
      });
      expect(meRes.statusCode).toBe(200);
      const meBody = meRes.json() as {
        user: { id: string };
        impersonation?: undefined;
      };
      expect(meBody.user.id).toBe(adminId);
      expect(meBody.impersonation).toBeUndefined();
    });
  });
});
