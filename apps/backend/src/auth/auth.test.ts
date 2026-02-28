import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';
import { hashPassword } from './password.js';
import { SESSION_COOKIE_NAME } from './middleware.js';

const TEST_EMAIL = `auth-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'testpass';

describe('Auth (Login, Session, geschützte Routen)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let testUserId: string;

  beforeAll(async () => {
    app = await buildApp();
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const user = await prisma.user.create({
      data: {
        name: 'Auth Test User',
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

  it('POST /api/v1/auth/login – gültige Credentials → 204 + Set-Cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(res.statusCode).toBe(204);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain(SESSION_COOKIE_NAME);
  });

  it('POST /api/v1/auth/login – falsches Passwort → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error?: string };
    expect(body.error).toBe('Anmeldung fehlgeschlagen');
  });

  it('POST /api/v1/auth/login – unbekannte E-Mail → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'unknown@example.com', password: 'any' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/companies ohne Cookie → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/companies mit gültiger Session → 200', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const setCookie = loginRes.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie ?? '');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; total: number; limit: number; offset: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.limit).toBeDefined();
    expect(body.offset).toBeDefined();
  });

  it('GET /api/v1/auth/me mit gültiger Session → 200 + User', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookieHeader = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'].join('; ')
      : String(loginRes.headers['set-cookie'] ?? '');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: cookieHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; name: string; email: string | null; isAdmin: boolean };
    expect(body.id).toBe(testUserId);
    expect(body.email).toBe(TEST_EMAIL);
    expect(body.name).toBe('Auth Test User');
  });

  it('POST /api/v1/auth/logout mit Cookie → 204, danach Session ungültig', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookieHeader = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'].join('; ')
      : String(loginRes.headers['set-cookie'] ?? '');

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: cookieHeader },
    });
    expect(logoutRes.statusCode).toBe(204);

    const afterRes = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
      headers: { cookie: cookieHeader },
    });
    expect(afterRes.statusCode).toBe(401);
  });
});
