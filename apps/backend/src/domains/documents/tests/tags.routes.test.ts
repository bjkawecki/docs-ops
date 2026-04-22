import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../../app.js';
import { prisma } from '../../../db.js';
import { hashPassword } from '../../auth/services/password.js';

const TS = `tags-${Date.now()}`;
const PASSWORD = 'testpass';

function getCookieHeader(setCookie: string | string[] | undefined): string {
  if (Array.isArray(setCookie))
    return setCookie
      .map((s) => (typeof s === 'string' ? s.split(';')[0].trim() : ''))
      .filter(Boolean)
      .join('; ');
  if (typeof setCookie === 'string') return setCookie.split(';')[0].trim();
  return '';
}

describe('Tags-API (GET/POST/DELETE /tags) scope-aware', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userId: string;
  let ownerId: string;
  let tagForDeleteId: string;
  const tag409Name = `Tag-409-${TS}`;

  beforeAll(async () => {
    app = await buildApp();
    const pw = await hashPassword(PASSWORD);
    const user = await prisma.user.create({
      data: {
        name: 'Tags Test User',
        email: `tags-user-${TS}@example.com`,
        passwordHash: pw,
      },
    });
    userId = user.id;
    const owner = await prisma.owner.create({
      data: { ownerUserId: userId },
    });
    ownerId = owner.id;
    const tagForDelete = await prisma.tag.create({
      data: { name: `Tag-To-Delete-${TS}`, ownerId },
    });
    tagForDeleteId = tagForDelete.id;
    await prisma.tag.create({
      data: { name: tag409Name, ownerId },
    });
  });

  afterAll(async () => {
    await prisma.tag.deleteMany({
      where: {
        name: {
          in: [tag409Name, `Tag-To-Delete-${TS}`, `Tag-Success-${TS}`],
        },
      },
    });
    if (ownerId) await prisma.owner.deleteMany({ where: { id: ownerId } });
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it('GET /api/v1/tags ohne ownerId/contextId → 400', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `tags-user-${TS}@example.com`, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toMatch(/ownerId|contextId|required/i);
  });

  it('GET /api/v1/tags?ownerId=... mit Auth → 200, nur Tags dieses Owners', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `tags-user-${TS}@example.com`, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tags?ownerId=${ownerId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; name: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body.every((t) => t.id && t.name)).toBe(true);
  });

  it('POST /api/v1/tags ohne Auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'SomeTag', ownerId }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /api/v1/tags/:tagId ohne Auth → 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tagForDeleteId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/tags mit Auth und name+ownerId → 201 + Tag', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `tags-user-${TS}@example.com`, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const name = `Tag-Success-${TS}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      payload: JSON.stringify({ name, ownerId }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; name: string };
    expect(body).toHaveProperty('id');
    expect(body.name).toBe(name);
  });

  it('POST /api/v1/tags mit doppeltem Namen im gleichen Scope → 409', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `tags-user-${TS}@example.com`, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      payload: JSON.stringify({ name: tag409Name, ownerId }),
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error?: string };
    expect(body.error).toMatch(/existiert bereits|Scope/i);
  });

  it('DELETE /api/v1/tags/:tagId mit Auth und existierendem Tag → 204', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `tags-user-${TS}@example.com`, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tagForDeleteId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/tags/:tagId bei unbekanntem Tag → 404', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `tags-user-${TS}@example.com`, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tagForDeleteId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error?: string };
    expect(body.error).toMatch(/not found|Tag/i);
  });
});
