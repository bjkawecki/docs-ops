import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../../app.js';
import { prisma } from '../../../db.js';
import { hashPassword } from '../../auth/services/password.js';
import { appVersion } from '../../../infrastructure/appVersion.js';

const TS = `system-${Date.now()}`;
const PASSWORD = 'testpass';

function getCookieHeader(setCookie: string | string[] | undefined): string {
  if (Array.isArray(setCookie)) {
    return setCookie
      .map((s) => (typeof s === 'string' ? s.split(';')[0].trim() : ''))
      .filter(Boolean)
      .join('; ');
  }
  if (typeof setCookie === 'string') return setCookie.split(';')[0].trim();
  return '';
}

describe('System routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userEmail: string;

  beforeAll(async () => {
    app = await buildApp();
    const pw = await hashPassword(PASSWORD);
    userEmail = `system-user-${TS}@example.com`;
    await prisma.user.create({
      data: {
        name: 'System Test User',
        email: userEmail,
        passwordHash: pw,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: userEmail } });
    await app.close();
  });

  it('GET /api/v1/system/version returns SemVer without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/system/version' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { version: string };
    expect(body.version).toBe(appVersion);
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('GET /api/v1/releases without session returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/releases' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/releases with session returns manifest entries', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: userEmail, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/releases',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { releases: Array<{ version: string; title: string }> };
    expect(body.releases.some((item) => item.version === '0.2.0')).toBe(true);
  });

  it('GET /api/v1/releases/0.2.0 returns markdown', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: userEmail, password: PASSWORD },
    });
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/releases/0.2.0',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { version: string; markdown: string };
    expect(body.version).toBe('0.2.0');
    expect(body.markdown.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/releases/9.9.9 returns 404', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: userEmail, password: PASSWORD },
    });
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/releases/9.9.9',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
