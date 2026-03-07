import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GrantRole } from '../../generated/prisma/client.js';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';
import { hashPassword } from '../auth/password.js';

const TS = `docs-${Date.now()}`;
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

describe('Documents routes (publish, versions, draft, draft-requests)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let scopeLeadId: string;
  let writerId: string;
  let companyId: string;
  let departmentId: string;
  let teamId: string;
  let ownerId: string;
  let contextId: string;
  let processId: string;
  /** Draft document (publishedAt null) for publish tests. */
  let draftDocId: string;
  /** Published document (after publish) for versions/draft/PR tests. */
  let publishedDocId: string;
  let draftRequestId: string;

  beforeAll(async () => {
    app = await buildApp();
    const pw = await hashPassword(PASSWORD);
    const [scopeLead, writer] = await Promise.all([
      prisma.user.create({
        data: {
          name: 'Scope Lead',
          email: `scope-lead-${TS}@example.com`,
          passwordHash: pw,
        },
      }),
      prisma.user.create({
        data: {
          name: 'Writer',
          email: `writer-${TS}@example.com`,
          passwordHash: pw,
        },
      }),
    ]);
    scopeLeadId = scopeLead.id;
    writerId = writer.id;

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
    await prisma.departmentLead.create({
      data: { userId: scopeLeadId, departmentId },
    });
    const owner = await prisma.owner.create({ data: { departmentId } });
    ownerId = owner.id;

    const ctx = await prisma.context.create({ data: {} });
    contextId = ctx.id;
    const process = await prisma.process.create({
      data: { name: `Process ${TS}`, contextId, ownerId },
    });
    processId = process.id;

    const draftDoc = await prisma.document.create({
      data: {
        title: `Draft Doc ${TS}`,
        content: 'Initial draft content',
        contextId,
      },
    });
    draftDocId = draftDoc.id;

    const publishedDoc = await prisma.document.create({
      data: {
        title: `Published Doc ${TS}`,
        content: 'Published content',
        contextId,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    publishedDocId = publishedDoc.id;
    const version = await prisma.documentVersion.create({
      data: {
        documentId: publishedDocId,
        content: 'Published content',
        versionNumber: 1,
        createdById: scopeLeadId,
      },
      select: { id: true },
    });
    await prisma.document.update({
      where: { id: publishedDocId },
      data: { currentPublishedVersionId: version.id },
    });

    await prisma.documentGrantUser.createMany({
      data: [
        { documentId: draftDocId, userId: writerId, role: GrantRole.Read },
        { documentId: draftDocId, userId: writerId, role: GrantRole.Write },
        { documentId: publishedDocId, userId: writerId, role: GrantRole.Read },
        { documentId: publishedDocId, userId: writerId, role: GrantRole.Write },
      ],
    });
  });

  afterAll(async () => {
    const docIds = [draftDocId, publishedDocId].filter((id): id is string => id != null);
    if (docIds.length > 0) {
      await prisma.documentAttachment.deleteMany({
        where: { documentId: { in: docIds } },
      });
      await prisma.draftRequest.deleteMany({ where: { documentId: { in: docIds } } });
      await prisma.documentDraft.deleteMany({ where: { documentId: { in: docIds } } });
      await prisma.documentVersion.deleteMany({ where: { documentId: { in: docIds } } });
      await prisma.documentGrantUser.deleteMany({ where: { documentId: { in: docIds } } });
      await prisma.document.deleteMany({ where: { id: { in: docIds } } });
    }
    if (processId) await prisma.process.deleteMany({ where: { id: processId } });
    if (contextId) await prisma.context.deleteMany({ where: { id: contextId } });
    if (ownerId) await prisma.owner.deleteMany({ where: { id: ownerId } });
    if (departmentId) await prisma.departmentLead.deleteMany({ where: { departmentId } });
    if (teamId) await prisma.team.deleteMany({ where: { id: teamId } });
    if (departmentId) await prisma.department.deleteMany({ where: { id: departmentId } });
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
    const userIds = [scopeLeadId, writerId].filter((id): id is string => id != null);
    if (userIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function loginAs(email: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(204);
    return getCookieHeader(res.headers['set-cookie']);
  }

  describe('POST /documents/:documentId/publish', () => {
    it('ohne Auth → 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${draftDocId}/publish`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('als Scope-Lead → 200, Document hat publishedAt, Version 1 existiert', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${draftDocId}/publish`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        publishedAt: string | null;
        currentPublishedVersionId: string | null;
      };
      expect(body.publishedAt).not.toBeNull();
      expect(body.currentPublishedVersionId).not.toBeNull();

      const doc = await prisma.document.findUnique({
        where: { id: draftDocId },
        select: { publishedAt: true, currentPublishedVersionId: true },
      });
      expect(doc?.publishedAt).not.toBeNull();
      expect(doc?.currentPublishedVersionId).not.toBeNull();

      const versions = await prisma.documentVersion.findMany({
        where: { documentId: draftDocId },
        select: { versionNumber: true },
      });
      expect(versions.some((v) => v.versionNumber === 1)).toBe(true);
    });

    it('erneut auf gleiches Dokument → 409', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${draftDocId}/publish`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /documents (catalog) sortBy', () => {
    it('sortBy=contextName returns 200 and items with contextName', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/documents?limit=10&sortBy=contextName&sortOrder=asc',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { items: { id: string; contextName: string }[]; total: number };
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.total).toBe('number');
      body.items.forEach((item) => {
        expect(item).toHaveProperty('contextName');
      });
    });
  });

  describe('GET /documents/:documentId/versions', () => {
    it('ohne Auth → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/versions`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('mit Auth → 200, items mit versionNumber und createdAt', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/versions`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        items: { id: string; versionNumber: number; createdAt: string }[];
      };
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.items[0]).toHaveProperty('versionNumber');
      expect(body.items[0]).toHaveProperty('createdAt');
    });
  });

  describe('GET /documents/:documentId/versions/:versionId', () => {
    let versionId: string;

    beforeAll(async () => {
      const v = await prisma.documentVersion.findFirst({
        where: { documentId: publishedDocId },
        select: { id: true },
      });
      versionId = v!.id;
    });

    it('mit Auth → 200, content und versionNumber', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/versions/${versionId}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { content: string; versionNumber: number };
      expect(body).toHaveProperty('content');
      expect(body.versionNumber).toBe(1);
    });
  });

  describe('GET/PUT /documents/:documentId/draft', () => {
    it('GET draft ohne bestehenden Draft → 404', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/draft`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
    });

    it('PUT draft auf veröffentlichtes Dokument → 200', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/documents/${publishedDocId}/draft`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ content: 'My draft content' }),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { content: string };
      expect(body.content).toBe('My draft content');
    });

    it('GET draft nach PUT → 200 mit gleichem Inhalt', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/draft`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { content: string };
      expect(body.content).toBe('My draft content');
    });

    it('PUT draft auf unveröffentlichtes Dokument → 400', async () => {
      const unpublishedDoc = await prisma.document.create({
        data: {
          title: `Unpublished ${TS}`,
          content: 'x',
          contextId,
        },
      });
      await prisma.documentGrantUser.create({
        data: { documentId: unpublishedDoc.id, userId: writerId, role: GrantRole.Write },
      });
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/documents/${unpublishedDoc.id}/draft`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ content: 'x' }),
      });
      expect(res.statusCode).toBe(400);
      await prisma.documentGrantUser.deleteMany({ where: { documentId: unpublishedDoc.id } });
      await prisma.document.deleteMany({ where: { id: unpublishedDoc.id } });
    });
  });

  describe('POST/GET /documents/:documentId/draft-requests, PATCH /draft-requests/:id', () => {
    it('POST draft-request als Writer → 201', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/draft-requests`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ draftContent: 'PR content for merge test' }),
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { id: string; status: string };
      expect(body.status).toBe('open');
      draftRequestId = body.id;
    });

    it('GET draft-requests → 200, items enthalten offenen PR', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/draft-requests?status=open`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        items: { id: string; status: string; submittedByName: string }[];
      };
      expect(body.items.some((i) => i.id === draftRequestId && i.status === 'open')).toBe(true);
    });

    it('PATCH merge als Scope-Lead → 200, Document hat neuen Inhalt und Version 2', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/draft-requests/${draftRequestId}`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ action: 'merge' }),
      });
      expect(res.statusCode).toBe(200);

      const doc = await prisma.document.findUnique({
        where: { id: publishedDocId },
        select: { content: true },
      });
      expect(doc?.content).toBe('PR content for merge test');

      const versions = await prisma.documentVersion.findMany({
        where: { documentId: publishedDocId },
        orderBy: { versionNumber: 'asc' },
        select: { versionNumber: true, content: true },
      });
      expect(versions.length).toBeGreaterThanOrEqual(2);
      expect(
        versions.some((v) => v.versionNumber === 2 && v.content === 'PR content for merge test')
      ).toBe(true);
    });

    it('PATCH merge auf bereits gemergten PR → 409', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/draft-requests/${draftRequestId}`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ action: 'merge' }),
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('PATCH reject', () => {
    let rejectDraftRequestId: string;

    beforeAll(async () => {
      const dr = await prisma.draftRequest.create({
        data: {
          documentId: publishedDocId,
          draftContent: 'Rejected content',
          status: 'open',
          submittedById: writerId,
        },
        select: { id: true },
      });
      rejectDraftRequestId = dr.id;
    });

    it('PATCH reject als Scope-Lead → 200, status rejected', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/draft-requests/${rejectDraftRequestId}`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ action: 'reject', comment: 'Not needed' }),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { status: string };
      expect(body.status).toBe('rejected');

      const dr = await prisma.draftRequest.findUnique({
        where: { id: rejectDraftRequestId },
        select: { status: true },
      });
      expect(dr?.status).toBe('rejected');
    });
  });

  describe('POST /documents/:documentId/draft/update-to-latest', () => {
    it('ohne Draft → 404', async () => {
      const noDraftDoc = await prisma.document.create({
        data: {
          title: `No draft doc ${TS}`,
          content: 'x',
          contextId,
          publishedAt: new Date(),
        },
      });
      const v = await prisma.documentVersion.create({
        data: {
          documentId: noDraftDoc.id,
          content: 'x',
          versionNumber: 1,
          createdById: scopeLeadId,
        },
      });
      await prisma.document.update({
        where: { id: noDraftDoc.id },
        data: { currentPublishedVersionId: v.id },
      });
      await prisma.documentGrantUser.createMany({
        data: [
          { documentId: noDraftDoc.id, userId: writerId, role: GrantRole.Read },
          { documentId: noDraftDoc.id, userId: writerId, role: GrantRole.Write },
        ],
      });
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${noDraftDoc.id}/draft/update-to-latest`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
      await prisma.documentGrantUser.deleteMany({ where: { documentId: noDraftDoc.id } });
      await prisma.documentVersion.deleteMany({ where: { documentId: noDraftDoc.id } });
      await prisma.document.deleteMany({ where: { id: noDraftDoc.id } });
    });

    it('Draft bereits auf current version → 200, upToDate: true', async () => {
      const doc = await prisma.document.findUnique({
        where: { id: publishedDocId },
        select: { currentPublishedVersionId: true },
      });
      expect(doc?.currentPublishedVersionId).not.toBeNull();
      const cookie = await loginAs(`writer-${TS}@example.com`);
      await app.inject({
        method: 'PUT',
        url: `/api/v1/documents/${publishedDocId}/draft`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          content: 'Up to date content',
          basedOnVersionId: doc!.currentPublishedVersionId,
        }),
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/draft/update-to-latest`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { upToDate?: boolean };
      expect(body.upToDate).toBe(true);
    });

    it('Draft hinter current version → 200, mergedContent und hasConflicts', async () => {
      const version1 = await prisma.documentVersion.findFirst({
        where: { documentId: publishedDocId, versionNumber: 1 },
        select: { id: true },
      });
      expect(version1).not.toBeNull();
      await prisma.documentDraft.upsert({
        where: { documentId_userId: { documentId: publishedDocId, userId: writerId } },
        create: {
          documentId: publishedDocId,
          userId: writerId,
          content: 'Draft based on v1',
          basedOnVersionId: version1!.id,
        },
        update: { content: 'Draft based on v1', basedOnVersionId: version1!.id },
      });
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/draft/update-to-latest`,
        headers: { cookie },
      });
      if (res.statusCode !== 200) {
        const errBody = res.json() as { error?: string; details?: string };
        throw new Error(
          `Expected 200, got ${res.statusCode}: ${errBody.error ?? ''} ${errBody.details ?? res.payload}`
        );
      }
      const body = res.json() as { mergedContent?: string; hasConflicts?: boolean };
      expect(typeof body.mergedContent).toBe('string');
      expect(typeof body.hasConflicts).toBe('boolean');
    });
  });

  describe('PUT /documents/:documentId/draft mit basedOnVersionId', () => {
    it('basedOnVersionId = currentPublishedVersionId → Draft wird mit basedOnVersionId gespeichert', async () => {
      const doc = await prisma.document.findUnique({
        where: { id: publishedDocId },
        select: { currentPublishedVersionId: true },
      });
      expect(doc?.currentPublishedVersionId).not.toBeNull();
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/documents/${publishedDocId}/draft`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          content: 'Saved with version pin',
          basedOnVersionId: doc!.currentPublishedVersionId,
        }),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { content: string; basedOnVersionId: string | null };
      expect(body.content).toBe('Saved with version pin');
      expect(body.basedOnVersionId).toBe(doc!.currentPublishedVersionId);
    });
  });

  describe('GET /documents/:documentId/pdf, attachments (storage)', () => {
    it('GET pdf when document has no pdfUrl → 404', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/pdf`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json() as { error?: string };
      expect(body.error).toBe('PDF not available');
    });

    it('POST attachment without storage (no MinIO) → 503', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/attachments`,
        headers: {
          cookie,
          'content-type': 'application/octet-stream',
          'x-filename': 'test.txt',
        },
        payload: Buffer.from('hello'),
      });
      expect(res.statusCode).toBe(503);
      const body = res.json() as { error?: string };
      expect(body.error).toBe('Storage not available');
    });
  });
});
