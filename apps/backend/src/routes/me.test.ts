import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';
import { hashPassword } from '../auth/password.js';

const TEST_EMAIL = `me-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'testpass';

function getCookieHeader(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  return Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie ?? '');
}

describe('Me routes (GET/PATCH /me, GET/PATCH /me/preferences)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let testUserId: string;

  beforeAll(async () => {
    app = await buildApp();
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const user = await prisma.user.create({
      data: {
        name: 'Me Test User',
        email: TEST_EMAIL,
        passwordHash,
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.session.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
    await app.close();
  });

  it('GET /api/v1/me ohne Cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/me mit Session → 200 + user, identity, preferences', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = getCookieHeader(loginRes);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      user: { id: string; name: string; email: string | null; isAdmin: boolean };
      identity: {
        teams: unknown[];
        departments: unknown[];
        supervisorOfDepartments: unknown[];
        userSpaces: unknown[];
      };
      preferences: Record<string, unknown>;
    };
    expect(body.user.id).toBe(testUserId);
    expect(body.user.name).toBe('Me Test User');
    expect(body.user.email).toBe(TEST_EMAIL);
    expect(body.identity).toBeDefined();
    expect(Array.isArray(body.identity.teams)).toBe(true);
    expect(Array.isArray(body.identity.departments)).toBe(true);
    expect(body.preferences).toBeDefined();
  });

  it('PATCH /api/v1/me → Name aktualisiert', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = getCookieHeader(loginRes);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { cookie },
      payload: { name: 'Me Test User Updated' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { name: string };
    expect(body.name).toBe('Me Test User Updated');

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: testUserId } });
    expect(updated.name).toBe('Me Test User Updated');
  });

  it('GET /api/v1/me/preferences mit Session → 200 + preferences', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = getCookieHeader(loginRes);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/preferences',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body).toBeDefined();
  });

  it('PATCH /api/v1/me/preferences → theme und sidebarPinned gespeichert', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = getCookieHeader(loginRes);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/preferences',
      headers: { cookie },
      payload: { theme: 'dark', sidebarPinned: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { theme?: string; sidebarPinned?: boolean };
    expect(body.theme).toBe('dark');
    expect(body.sidebarPinned).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: testUserId },
      select: { preferences: true },
    });
    const prefs = user.preferences as { theme?: string; sidebarPinned?: boolean } | null;
    expect(prefs?.theme).toBe('dark');
    expect(prefs?.sidebarPinned).toBe(true);
  });
});
