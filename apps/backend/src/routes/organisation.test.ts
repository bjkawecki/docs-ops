import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';
import { hashPassword } from '../auth/password.js';

const ADMIN_EMAIL = `org-admin-${Date.now()}@example.com`;
const USER_EMAIL = `org-user-${Date.now()}@example.com`;
const PASSWORD = 'testpass';

function getCookieHeader(setCookie: string | string[] | undefined): string {
  return Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie ?? '');
}

describe('Organisation (Companies, Departments, Teams)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminId: string;
  let userId: string;
  let companyId: string;

  beforeAll(async () => {
    app = await buildApp();
    const pw = await hashPassword(PASSWORD);
    const [admin, user] = await Promise.all([
      prisma.user.create({
        data: { name: 'Org Admin', email: ADMIN_EMAIL, passwordHash: pw, isAdmin: true },
      }),
      prisma.user.create({
        data: { name: 'Org User', email: USER_EMAIL, passwordHash: pw, isAdmin: false },
      }),
    ]);
    adminId = admin.id;
    userId = user.id;
  });

  afterAll(async () => {
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
    const ids = [adminId, userId].filter((id): id is string => id != null);
    if (ids.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app.close();
  });

  it('GET /api/v1/companies ohne Auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/companies' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/companies ohne Auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      payload: { name: 'Test AG' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/companies als Nicht-Admin → 403', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: USER_EMAIL, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { cookie: getCookieHeader(loginRes.headers['set-cookie']) },
      payload: { name: 'Test AG' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/v1/companies als Admin → 201', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: ADMIN_EMAIL, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { cookie: getCookieHeader(loginRes.headers['set-cookie']) },
      payload: { name: 'Kern-API Test AG' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; name: string };
    expect(body.name).toBe('Kern-API Test AG');
    expect(body.id).toBeDefined();
    companyId = body.id;
  });

  it('GET /api/v1/companies mit Auth → 200 + paginierte Liste', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: ADMIN_EMAIL, password: PASSWORD },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
      headers: { cookie: getCookieHeader(loginRes.headers['set-cookie']) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; total: number; limit: number; offset: number };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.limit).toBeDefined();
    expect(body.offset).toBeDefined();
  });
});
