import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';
import { hashPassword } from '../auth/password.js';

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

describe('Tags-API (POST/DELETE /tags)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userId: string;
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
    const tagForDelete = await prisma.tag.create({
      data: { name: `Tag-To-Delete-${TS}` },
    });
    tagForDeleteId = tagForDelete.id;
    await prisma.tag.create({
      data: { name: tag409Name },
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
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it('POST /api/v1/tags ohne Auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'SomeTag' }),
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

  it('POST /api/v1/tags mit Auth und gültigem Body → 201 + Tag', async () => {
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
      payload: JSON.stringify({ name }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; name: string };
    expect(body).toHaveProperty('id');
    expect(body.name).toBe(name);
  });

  it('POST /api/v1/tags mit doppeltem Namen → 409', async () => {
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
      payload: JSON.stringify({ name: tag409Name }),
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error?: string };
    expect(body.error).toContain('existiert bereits');
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
