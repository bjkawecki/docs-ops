import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';
import { hashPassword } from '../auth/password.js';

const TEST_EMAIL = `me-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'testpass';

function getCookieHeader(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  if (Array.isArray(setCookie)) return setCookie.join('; ');
  if (typeof setCookie === 'string') return setCookie;
  return '';
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
      user: { id: string; name: string; email: string };
      identity: { teams: unknown[]; departments: unknown[] };
      preferences: unknown;
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

  it('GET /api/v1/me/storage (personal) → 200 mit usedBytes und attachmentCount', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = getCookieHeader(loginRes);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/storage',
      headers: { cookie },
    });
    if (res.statusCode !== 200) {
      const payload = res.payload ? String(res.payload).slice(0, 500) : '';
      throw new Error(`Expected 200, got ${res.statusCode}. Body: ${payload}`);
    }
    const body = res.json() as { usedBytes: number; attachmentCount: number };
    expect(typeof body.usedBytes).toBe('number');
    expect(body.usedBytes).toBe(0);
    expect(typeof body.attachmentCount).toBe('number');
    expect(body.attachmentCount).toBe(0);
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
    const body = res.json() as { theme: string; sidebarPinned: boolean };
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

  it('PATCH /api/v1/me/preferences → primaryColor gespeichert und per GET geliefert', async () => {
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
      payload: { primaryColor: 'green' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { primaryColor: string };
    expect(body.primaryColor).toBe('green');

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me/preferences',
      headers: { cookie },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json() as { primaryColor?: string };
    expect(getBody.primaryColor).toBe('green');

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: testUserId },
      select: { preferences: true },
    });
    const prefs = user.preferences as { primaryColor?: string } | null;
    expect(prefs?.primaryColor).toBe('green');
  });

  it('PATCH /api/v1/me/preferences → scopeRecentPanelOpen gespeichert und per GET geliefert', async () => {
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
      payload: { scopeRecentPanelOpen: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { scopeRecentPanelOpen: boolean };
    expect(body.scopeRecentPanelOpen).toBe(false);

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me/preferences',
      headers: { cookie },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json() as { scopeRecentPanelOpen?: boolean };
    expect(getBody.scopeRecentPanelOpen).toBe(false);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/preferences',
      headers: { cookie },
      payload: { scopeRecentPanelOpen: true },
    });
    expect(patchRes.statusCode).toBe(200);
    const patchBody = patchRes.json() as { scopeRecentPanelOpen: boolean };
    expect(patchBody.scopeRecentPanelOpen).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: testUserId },
      select: { preferences: true },
    });
    const prefs = user.preferences as { scopeRecentPanelOpen?: boolean } | null;
    expect(prefs?.scopeRecentPanelOpen).toBe(true);
  });

  it('PATCH /api/v1/me/preferences → recentItemsByScope gespeichert und per GET geliefert', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = getCookieHeader(loginRes);

    const scopeKey = 'company:clh3test000008l008eazy0001';
    const items = [
      { type: 'process' as const, id: 'clh3test000008l008eazy0002', name: 'Prozess A' },
      { type: 'project' as const, id: 'clh3test000008l008eazy0003', name: 'Projekt B' },
    ];

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/preferences',
      headers: { cookie },
      payload: { recentItemsByScope: { [scopeKey]: items } },
    });
    expect(res.statusCode).toBe(200);
    type RecentItem = { type: string; id: string; name: string };
    const body = res.json() as { recentItemsByScope?: Record<string, RecentItem[]> };
    expect(body.recentItemsByScope).toBeDefined();
    expect(body.recentItemsByScope?.[scopeKey]).toHaveLength(2);
    expect(body.recentItemsByScope?.[scopeKey]?.[0].type).toBe('process');
    expect(body.recentItemsByScope?.[scopeKey]?.[0].name).toBe('Prozess A');

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me/preferences',
      headers: { cookie },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json() as { recentItemsByScope?: Record<string, RecentItem[]> };
    expect(getBody.recentItemsByScope?.[scopeKey]).toHaveLength(2);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: testUserId },
      select: { preferences: true },
    });
    const prefs = user.preferences as { recentItemsByScope?: Record<string, unknown[]> } | null;
    expect(prefs?.recentItemsByScope?.[scopeKey]).toHaveLength(2);
  });

  it('GET /api/v1/me/drafts ohne Cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/drafts' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/me/drafts mit Session und scope=personal → 200 + draftDocuments, openDraftRequests', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const cookie = getCookieHeader(loginRes);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/drafts?scope=personal&limit=20&offset=0',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      draftDocuments: unknown[];
      openDraftRequests: unknown[];
      limit: number;
      offset: number;
    };
    expect(Array.isArray(body.draftDocuments)).toBe(true);
    expect(Array.isArray(body.openDraftRequests)).toBe(true);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
  });
});
