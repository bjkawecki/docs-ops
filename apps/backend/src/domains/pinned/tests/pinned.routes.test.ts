import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GrantRole } from '../../../../generated/prisma/client.js';
import { buildApp } from '../../../app.js';
import { prisma } from '../../../db.js';
import { hashPassword } from '../../auth/services/password.js';
import { canPinForScope } from '../permissions/pinnedPermissions.js';
import { emptyBlockDocumentJson } from '../../documents/services/documentBlocksBackfill.js';

const TS = `pinned-${Date.now()}`;
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

describe('Pinned routes (GET/POST/DELETE /pinned)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminId: string;
  let teamLeadId: string;
  let normalUserId: string;
  let companyId: string;
  let departmentId: string;
  let teamId: string;
  let ownerId: string;
  let contextId: string;
  let processId: string;
  let documentId: string;
  /** Dokument in persönlichem Kontext (Team Lead hat kein Leserecht). */
  let documentPersonalId: string;
  let contextPersonalId: string;
  let ownerPersonalId: string;
  /** Pin für DELETE-Tests (in beforeAll angelegt, unabhängig von POST-Tests). */
  let pinIdForDeleteTests: string;

  beforeAll(async () => {
    app = await buildApp();
    const pw = await hashPassword(PASSWORD);
    const [admin, teamLead, normalUser] = await Promise.all([
      prisma.user.create({
        data: {
          name: 'Pinned Admin',
          email: `pinned-admin-${TS}@example.com`,
          passwordHash: pw,
          isAdmin: true,
        },
      }),
      prisma.user.create({
        data: {
          name: 'Team Lead',
          email: `pinned-lead-${TS}@example.com`,
          passwordHash: pw,
        },
      }),
      prisma.user.create({
        data: {
          name: 'Normal User',
          email: `pinned-user-${TS}@example.com`,
          passwordHash: pw,
        },
      }),
    ]);
    adminId = admin.id;
    teamLeadId = teamLead.id;
    normalUserId = normalUser.id;

    const company = await prisma.company.create({ data: { name: `Company ${TS}` } });
    companyId = company.id;
    const dept = await prisma.department.create({
      data: { name: `Dept ${TS}`, companyId },
    });
    departmentId = dept.id;
    const team = await prisma.team.create({
      data: { name: `Team ${TS}`, departmentId },
    });
    teamId = team.id;
    const owner = await prisma.owner.create({ data: { teamId } });
    ownerId = owner.id;

    await Promise.all([
      prisma.teamMember.create({ data: { teamId, userId: normalUserId } }),
      prisma.teamMember.create({ data: { teamId, userId: teamLeadId } }),
      prisma.teamLead.create({ data: { teamId, userId: teamLeadId } }),
    ]);

    const ctx = await prisma.context.create({ data: {} });
    contextId = ctx.id;
    const process = await prisma.process.create({
      data: { name: `Process ${TS}`, contextId, ownerId },
    });
    processId = process.id;
    const doc = await prisma.document.create({
      data: {
        title: `Doc ${TS}`,
        draftBlocks: emptyBlockDocumentJson(),
        contextId,
      },
    });
    documentId = doc.id;
    await prisma.documentGrantTeam.create({
      data: { documentId, teamId, role: GrantRole.Read },
    });

    const ownerPersonal = await prisma.owner.create({
      data: { ownerUserId: normalUserId },
    });
    ownerPersonalId = ownerPersonal.id;
    const ctxPersonal = await prisma.context.create({ data: {} });
    contextPersonalId = ctxPersonal.id;
    await prisma.process.create({
      data: {
        name: `Personal ${TS}`,
        contextId: contextPersonalId,
        ownerId: ownerPersonalId,
      },
    });
    const docPersonal = await prisma.document.create({
      data: {
        title: `Doc Personal ${TS}`,
        draftBlocks: emptyBlockDocumentJson(),
        contextId: contextPersonalId,
      },
    });
    documentPersonalId = docPersonal.id;
    await prisma.documentGrantUser.create({
      data: { documentId: documentPersonalId, userId: normalUserId, role: GrantRole.Read },
    });

    const pin = await prisma.documentPinnedInScope.create({
      data: {
        documentId,
        scopeType: 'team',
        scopeId: teamId,
        pinnedById: teamLeadId,
      },
    });
    pinIdForDeleteTests = pin.id;
  });

  afterAll(async () => {
    const docIds = [documentId, documentPersonalId].filter((id): id is string => id != null);
    if (docIds.length > 0) {
      await prisma.documentPinnedInScope.deleteMany({
        where: { documentId: { in: docIds } },
      });
      if (documentPersonalId) {
        await prisma.documentGrantUser.deleteMany({
          where: { documentId: documentPersonalId },
        });
      }
      if (documentId) {
        await prisma.documentGrantTeam.deleteMany({ where: { documentId } });
      }
    }
    if (docIds.length > 0) {
      await prisma.document.deleteMany({
        where: { id: { in: docIds } },
      });
    }
    if (processId) await prisma.process.deleteMany({ where: { id: processId } });
    if (contextPersonalId) {
      await prisma.process.deleteMany({ where: { contextId: contextPersonalId } });
    }
    const ctxIds = [contextId, contextPersonalId].filter((id): id is string => id != null);
    if (ctxIds.length > 0) {
      await prisma.context.deleteMany({ where: { id: { in: ctxIds } } });
    }
    const ownerIds = [ownerId, ownerPersonalId].filter((id): id is string => id != null);
    if (ownerIds.length > 0) {
      await prisma.owner.deleteMany({ where: { id: { in: ownerIds } } });
    }
    if (teamId) {
      await prisma.teamLead.deleteMany({ where: { teamId } });
      await prisma.teamMember.deleteMany({ where: { teamId } });
      await prisma.team.deleteMany({ where: { id: teamId } });
    }
    if (departmentId) await prisma.department.deleteMany({ where: { id: departmentId } });
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
    const userIds = [adminId, teamLeadId, normalUserId].filter((id): id is string => id != null);
    if (userIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app.close();
  });

  it('Setup: Team Lead darf für Team pin/unpin (canPinForScope)', async () => {
    const canPin = await canPinForScope(prisma, teamLeadId, 'team', teamId);
    expect(canPin).toBe(true);
  });

  it('GET /api/v1/pinned ohne Auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/pinned' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/pinned ohne Auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pinned',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ scopeType: 'team', scopeId: teamId, documentId }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /api/v1/pinned/:id ohne Auth → 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/pinned/cxxxxxxxxxxxxxxxxxxxxxxxxx',
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/pinned mit Auth → 200, items Array', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `pinned-lead-${TS}@example.com`, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/pinned',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('POST /api/v1/pinned als Nicht-Scope-Lead → 403', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `pinned-user-${TS}@example.com`, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pinned',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ scopeType: 'team', scopeId: teamId, documentId }),
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error?: string };
    expect(body.error).toContain('Permission denied');
  });

  it('POST /api/v1/pinned als Team Lead → 201', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `pinned-lead-${TS}@example.com`, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json() as { user: { id: string } };
    expect(meBody.user.id).toBe(teamLeadId);

    const payloadObj = { scopeType: 'team', scopeId: teamId, documentId };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pinned',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify(payloadObj),
    });
    expect([200, 201]).toContain(res.statusCode);
    const body = res.json() as {
      id: string;
      scopeType: string;
      scopeId: string;
      documentId: string;
      order: number;
      pinnedAt: string;
    };
    expect(body.id).toBeDefined();
    expect(body.scopeType).toBe('team');
    expect(body.scopeId).toBe(teamId);
    expect(body.documentId).toBe(documentId);
    expect(body.order).toBe(0);
    expect(body.pinnedAt).toBeDefined();

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/pinned',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify(payloadObj),
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json() as { id: string };
    expect(body2.id).toBeDefined();
  });

  it('GET /api/v1/pinned liefert Pin mit canUnpin für Scope-Lead', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `pinned-lead-${TS}@example.com`, password: PASSWORD },
    });
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/pinned',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{
        id: string;
        documentTitle: string;
        documentHref: string;
        canUnpin: boolean;
      }>;
    };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    const pin = body.items.find((p) => p.documentHref === `/documents/${documentId}`);
    expect(pin).toBeDefined();
    expect(pin!.documentTitle).toContain(TS);
    expect(pin!.canUnpin).toBe(true);
  });

  it('POST /api/v1/pinned ohne Leserecht auf Dokument → 403', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `pinned-lead-${TS}@example.com`, password: PASSWORD },
    });
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/pinned',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        scopeType: 'team',
        scopeId: teamId,
        documentId: documentPersonalId,
      }),
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error?: string };
    expect(body.error).toMatch(/read|denied/i);
  });

  it('DELETE /api/v1/pinned/:id als Nicht-Scope-Lead → 403', async () => {
    const userLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `pinned-user-${TS}@example.com`, password: PASSWORD },
    });
    const userCookie = getCookieHeader(userLoginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/pinned/${pinIdForDeleteTests}`,
      headers: { cookie: userCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE /api/v1/pinned/:id als Team Lead → 204', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `pinned-lead-${TS}@example.com`, password: PASSWORD },
    });
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/pinned/${pinIdForDeleteTests}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/pinned/:id bei unbekanntem id → 404', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `pinned-lead-${TS}@example.com`, password: PASSWORD },
    });
    const cookie = getCookieHeader(loginRes.headers['set-cookie']);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/pinned/cxxxxxxxxxxxxxxxxxxxxxxxxx',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
