import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DocumentSuggestionStatus, GrantRole } from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';
import { hashPassword } from '../auth/password.js';
import { exampleBlockDocumentV0 } from '../services/documents/blockSchema.js';
import { blockDocumentJsonFromMarkdown } from '../services/documents/documentBlocksBackfill.js';

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

describe('Documents routes (publish, versions, lead-draft)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let scopeLeadId: string;
  let writerId: string;
  /** Nur Read auf publishedDocId – kein Lead-Draft-Lesen. */
  let readerOnlyId: string;
  let companyId: string;
  let departmentId: string;
  let teamId: string;
  let ownerId: string;
  let contextId: string;
  let processId: string;
  /** Draft document (publishedAt null) for publish tests. */
  let draftDocId: string;
  /** Published document (after publish) for versions tests. */
  let publishedDocId: string;

  beforeAll(async () => {
    app = await buildApp();
    const pw = await hashPassword(PASSWORD);
    const [scopeLead, writer, readerOnly] = await Promise.all([
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
      prisma.user.create({
        data: {
          name: 'Reader Only',
          email: `reader-only-${TS}@example.com`,
          passwordHash: pw,
        },
      }),
    ]);
    scopeLeadId = scopeLead.id;
    writerId = writer.id;
    readerOnlyId = readerOnly.id;

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
        draftBlocks: blockDocumentJsonFromMarkdown('Initial draft content'),
        contextId,
      },
    });
    draftDocId = draftDoc.id;

    const publishedDoc = await prisma.$transaction(async (tx) => {
      const blocksJson = blockDocumentJsonFromMarkdown('# Intro\n\nPublished content');
      const d = await tx.document.create({
        data: {
          title: `Published Doc ${TS}`,
          draftBlocks: blocksJson,
          contextId,
        },
      });
      const version = await tx.documentVersion.create({
        data: {
          documentId: d.id,
          blocks: blocksJson,
          blocksSchemaVersion: 0,
          versionNumber: 1,
          createdById: scopeLeadId,
        },
      });
      await tx.document.update({
        where: { id: d.id },
        data: {
          publishedAt: new Date(),
          currentPublishedVersionId: version.id,
        },
      });
      return { id: d.id };
    });
    publishedDocId = publishedDoc.id;

    await prisma.documentGrantUser.createMany({
      data: [
        { documentId: draftDocId, userId: writerId, role: GrantRole.Read },
        { documentId: draftDocId, userId: writerId, role: GrantRole.Write },
        { documentId: publishedDocId, userId: writerId, role: GrantRole.Read },
        { documentId: publishedDocId, userId: writerId, role: GrantRole.Write },
        { documentId: publishedDocId, userId: readerOnlyId, role: GrantRole.Read },
      ],
    });
  });

  afterAll(async () => {
    const docIds = [draftDocId, publishedDocId].filter((id): id is string => id != null);
    if (docIds.length > 0) {
      await prisma.documentComment.deleteMany({
        where: { documentId: { in: docIds } },
      });
      await prisma.documentAttachment.deleteMany({
        where: { documentId: { in: docIds } },
      });
      await prisma.documentGrantUser.deleteMany({ where: { documentId: { in: docIds } } });
      // Kein documentVersion.deleteMany vor document.delete: bei veröffentlichten Docs setzt
      // FK Document.currentPublishedVersionId ON DELETE SET NULL → CHECK mit publishedAt.
      await prisma.document.deleteMany({ where: { id: { in: docIds } } });
    }
    if (processId) await prisma.process.deleteMany({ where: { id: processId } });
    if (contextId) await prisma.context.deleteMany({ where: { id: contextId } });
    if (ownerId) await prisma.owner.deleteMany({ where: { id: ownerId } });
    if (departmentId) await prisma.departmentLead.deleteMany({ where: { departmentId } });
    if (teamId) await prisma.team.deleteMany({ where: { id: teamId } });
    if (departmentId) await prisma.department.deleteMany({ where: { id: departmentId } });
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
    const userIds = [scopeLeadId, writerId, readerOnlyId].filter((id): id is string => id != null);
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

    it('Publish mit Lead-Draft-Blocks: Version.blocks aus Draft; pending → superseded', async () => {
      let ephemeralId: string | null = null;
      try {
        const d = await prisma.document.create({
          data: {
            title: `Publish from draft blocks ${TS}`,
            contextId,
            draftBlocks: exampleBlockDocumentV0 as unknown as Prisma.InputJsonValue,
            draftRevision: 1,
          },
        });
        ephemeralId = d.id;
        await prisma.documentGrantUser.createMany({
          data: [{ documentId: ephemeralId, userId: writerId, role: GrantRole.Write }],
        });
        const sg = await prisma.documentSuggestion.create({
          data: {
            documentId: ephemeralId,
            authorId: writerId,
            status: DocumentSuggestionStatus.pending,
            baseDraftRevision: 1,
            ops: [
              { op: 'deleteBlock', blockId: '550e8400-e29b-41d4-a716-446655440002' },
            ] as unknown as Prisma.InputJsonValue,
          },
        });
        const cookie = await loginAs(`scope-lead-${TS}@example.com`);
        const res = await app.inject({
          method: 'POST',
          url: `/api/v1/documents/${ephemeralId}/publish`,
          headers: { cookie },
        });
        expect(res.statusCode).toBe(200);

        const v1 = await prisma.documentVersion.findFirst({
          where: { documentId: ephemeralId, versionNumber: 1 },
          select: { blocks: true },
        });
        expect(JSON.parse(JSON.stringify(v1?.blocks))).toEqual(exampleBlockDocumentV0);

        const sgRow = await prisma.documentSuggestion.findUnique({
          where: { id: sg.id },
          select: { status: true },
        });
        expect(sgRow?.status).toBe(DocumentSuggestionStatus.superseded);
      } finally {
        if (ephemeralId) {
          await prisma.document.deleteMany({ where: { id: ephemeralId } });
        }
      }
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

  describe('GET/POST/PATCH/DELETE /documents/:documentId/comments', () => {
    it('Writer POST comment → 201; GET list → 200 with canDelete', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const post = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: '  First comment  ' }),
      });
      expect(post.statusCode).toBe(201);
      const created = post.json() as { id: string; text: string; canDelete: boolean };
      expect(created.text).toBe('First comment');
      expect(created.canDelete).toBe(true);

      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/comments?limit=20&offset=0`,
        headers: { cookie },
      });
      expect(list.statusCode).toBe(200);
      const body = list.json() as {
        items: { id: string; canDelete: boolean; authorName: string }[];
        total: number;
      };
      expect(body.total).toBeGreaterThanOrEqual(1);
      const row = body.items.find((i) => i.id === created.id);
      expect(row).toBeDefined();
      expect(row!.canDelete).toBe(true);
      expect(row!.authorName).toBe('Writer');
    });

    it('POST with unknown body key (strict) → 400', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'x', notAField: true }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST reply to root → 201; GET lists nested replies', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const root = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'Root for thread' }),
      });
      expect(root.statusCode).toBe(201);
      const rootId = (root.json() as { id: string }).id;

      const reply = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'Nested reply', parentId: rootId }),
      });
      expect(reply.statusCode).toBe(201);
      expect((reply.json() as { parentId: string }).parentId).toBe(rootId);

      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/comments?limit=50&offset=0`,
        headers: { cookie },
      });
      expect(list.statusCode).toBe(200);
      const body = list.json() as {
        items: Array<{ id: string; replies: { id: string; text: string }[] }>;
      };
      const item = body.items.find((i) => i.id === rootId);
      expect(item).toBeDefined();
      expect(item!.replies.some((r) => r.text === 'Nested reply')).toBe(true);
    });

    it('POST reply to reply → 400', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const root = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'Root B' }),
      });
      const rootId = (root.json() as { id: string }).id;
      const reply = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'First reply', parentId: rootId }),
      });
      const replyId = (reply.json() as { id: string }).id;
      const bad = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'Too deep', parentId: replyId }),
      });
      expect(bad.statusCode).toBe(400);
    });

    it('POST with invalid anchorHeadingId → 400', async () => {
      await prisma.document.update({
        where: { id: publishedDocId },
        data: { draftBlocks: blockDocumentJsonFromMarkdown('# Intro\n\nPublished content') },
      });
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'Anchored', anchorHeadingId: 'no-such-heading-slug' }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST with anchorHeadingId matching document heading → 201', async () => {
      await prisma.document.update({
        where: { id: publishedDocId },
        data: { draftBlocks: blockDocumentJsonFromMarkdown('# Intro\n\nPublished content') },
      });
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'In section', anchorHeadingId: 'intro' }),
      });
      expect(res.statusCode).toBe(201);
      const j = res.json() as { anchorHeadingId: string | null };
      expect(j.anchorHeadingId).toBe('intro');
    });

    it('Writer PATCH own comment → 200; PATCH other → 403', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const post = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'to patch' }),
      });
      expect(post.statusCode).toBe(201);
      const { id: commentId } = post.json() as { id: string };

      const patch = await app.inject({
        method: 'PATCH',
        url: `/api/v1/documents/${publishedDocId}/comments/${commentId}`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'updated' }),
      });
      expect(patch.statusCode).toBe(200);
      expect((patch.json() as { text: string }).text).toBe('updated');

      const leadCookie = await loginAs(`scope-lead-${TS}@example.com`);
      const leadPost = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie: leadCookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'by lead' }),
      });
      expect(leadPost.statusCode).toBe(201);
      const leadCommentId = (leadPost.json() as { id: string }).id;

      const forbidden = await app.inject({
        method: 'PATCH',
        url: `/api/v1/documents/${publishedDocId}/comments/${leadCommentId}`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'hijack' }),
      });
      expect(forbidden.statusCode).toBe(403);
    });

    it('Department lead DELETE writer comment → 204', async () => {
      const writerCookie = await loginAs(`writer-${TS}@example.com`);
      const post = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie: writerCookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'delete me' }),
      });
      expect(post.statusCode).toBe(201);
      const commentId = (post.json() as { id: string }).id;

      const leadCookie = await loginAs(`scope-lead-${TS}@example.com`);
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/documents/${publishedDocId}/comments/${commentId}`,
        headers: { cookie: leadCookie },
      });
      expect(del.statusCode).toBe(204);
    });

    it('Writer cannot DELETE lead comment → 403', async () => {
      const leadCookie = await loginAs(`scope-lead-${TS}@example.com`);
      const post = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie: leadCookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'lead owned' }),
      });
      expect(post.statusCode).toBe(201);
      const commentId = (post.json() as { id: string }).id;

      const writerCookie = await loginAs(`writer-${TS}@example.com`);
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/documents/${publishedDocId}/comments/${commentId}`,
        headers: { cookie: writerCookie },
      });
      expect(del.statusCode).toBe(403);
    });

    it('DELETE root soft-deletes parent; replies remain in DB and in GET', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const root = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'Root soft' }),
      });
      const rootId = (root.json() as { id: string }).id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'Child stays', parentId: rootId }),
      });
      const before = await prisma.documentComment.count({ where: { documentId: publishedDocId } });
      expect(before).toBeGreaterThanOrEqual(2);

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/documents/${publishedDocId}/comments/${rootId}`,
        headers: { cookie },
      });
      expect(del.statusCode).toBe(204);
      const after = await prisma.documentComment.count({ where: { documentId: publishedDocId } });
      expect(after).toBe(before);

      const row = await prisma.documentComment.findUnique({ where: { id: rootId } });
      expect(row?.deletedAt).not.toBeNull();

      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/comments?limit=50&offset=0`,
        headers: { cookie },
      });
      expect(list.statusCode).toBe(200);
      const body = list.json() as {
        items: Array<{
          id: string;
          deletedAt: string | null;
          text: string;
          replies: { text: string }[];
        }>;
      };
      const item = body.items.find((i) => i.id === rootId);
      expect(item).toBeDefined();
      expect(item!.deletedAt).not.toBeNull();
      expect(item!.text).toBe('');
      expect(item!.replies.some((r) => r.text === 'Child stays')).toBe(true);
    });

    it('DELETE root again → 409 already removed', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const root = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'Root twice' }),
      });
      const rootId = (root.json() as { id: string }).id;
      const first = await app.inject({
        method: 'DELETE',
        url: `/api/v1/documents/${publishedDocId}/comments/${rootId}`,
        headers: { cookie },
      });
      expect(first.statusCode).toBe(204);
      const second = await app.inject({
        method: 'DELETE',
        url: `/api/v1/documents/${publishedDocId}/comments/${rootId}`,
        headers: { cookie },
      });
      expect(second.statusCode).toBe(409);
    });

    it('POST reply when parent root is soft-deleted → 400', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const root = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'Root for reply block' }),
      });
      const rootId = (root.json() as { id: string }).id;
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/documents/${publishedDocId}/comments/${rootId}`,
        headers: { cookie },
      });
      const reply = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/comments`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ text: 'Too late', parentId: rootId }),
      });
      expect(reply.statusCode).toBe(400);
    });
  });

  describe('GET/PATCH /documents/:documentId/lead-draft (EPIC-4)', () => {
    it('ohne Auth → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/lead-draft`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('Read-only → GET lead-draft 403', async () => {
      const cookie = await loginAs(`reader-only-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/lead-draft`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(403);
    });

    it('Writer → GET 200, canEdit false', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/lead-draft`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { draftRevision: number; canEdit: boolean };
      expect(body.canEdit).toBe(false);
      expect(body.draftRevision).toBe(0);
    });

    it('Scope-Lead → GET 200, canEdit true', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/lead-draft`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { canEdit: boolean };
      expect(body.canEdit).toBe(true);
    });

    it('Writer → PATCH 403', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/documents/${publishedDocId}/lead-draft`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          expectedRevision: 0,
          blocks: exampleBlockDocumentV0,
        }),
      });
      expect(res.statusCode).toBe(403);
    });

    it('Lead PATCH mit falscher expectedRevision → 409', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/documents/${publishedDocId}/lead-draft`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          expectedRevision: 99,
          blocks: exampleBlockDocumentV0,
        }),
      });
      expect(res.statusCode).toBe(409);
    });

    it('Lead PATCH expectedRevision 0 → 200, Revision 1', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/documents/${publishedDocId}/lead-draft`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          expectedRevision: 0,
          blocks: exampleBlockDocumentV0,
        }),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { draftRevision: number };
      expect(body.draftRevision).toBe(1);
    });

    it('wiederholter PATCH mit expectedRevision 0 → 409', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/documents/${publishedDocId}/lead-draft`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          expectedRevision: 0,
          blocks: exampleBlockDocumentV0,
        }),
      });
      expect(res.statusCode).toBe(409);
    });

    it('If-Match widerspricht expectedRevision → 400', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/documents/${publishedDocId}/lead-draft`,
        headers: {
          cookie,
          'content-type': 'application/json',
          'if-match': '"0"',
        },
        payload: JSON.stringify({
          expectedRevision: 1,
          blocks: exampleBlockDocumentV0,
        }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('PATCH mit expectedRevision 1 → 200, Revision 2', async () => {
      const cookie = await loginAs(`scope-lead-${TS}@example.com`);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/documents/${publishedDocId}/lead-draft`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          expectedRevision: 1,
          blocks: exampleBlockDocumentV0,
        }),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { draftRevision: number };
      expect(body.draftRevision).toBe(2);
    });
  });

  describe('Suggestions (EPIC-5)', () => {
    /** Definierter Lead-Draft für diese Suite (löst Filter `-t Suggestions` ohne vorherige lead-draft-Tests). */
    beforeAll(async () => {
      await prisma.document.update({
        where: { id: publishedDocId },
        data: {
          draftBlocks: exampleBlockDocumentV0 as unknown as Prisma.InputJsonValue,
          draftRevision: 0,
        },
      });
    });

    it('Read-only GET suggestions → 403', async () => {
      const cookie = await loginAs(`reader-only-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/suggestions`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(403);
    });

    it('Writer GET suggestions → 200', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${publishedDocId}/suggestions`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });

    it('Writer POST mit falscher baseDraftRevision → 409', async () => {
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/suggestions`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          baseDraftRevision: 99_999,
          ops: [{ op: 'deleteBlock', blockId: '550e8400-e29b-41d4-a716-446655440002' }],
        }),
      });
      expect(res.statusCode).toBe(409);
      const body = res.json() as { code?: string };
      expect(body.code).toBe('stale_suggestion');
    });

    it('Writer POST gültige Suggestion → 201; withdraw → 200', async () => {
      const revRow = await prisma.document.findUnique({
        where: { id: publishedDocId },
        select: { draftRevision: true },
      });
      const rev = revRow!.draftRevision;
      const cookie = await loginAs(`writer-${TS}@example.com`);
      const create = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/suggestions`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          baseDraftRevision: rev,
          ops: [{ op: 'deleteBlock', blockId: '550e8400-e29b-41d4-a716-446655440002' }],
        }),
      });
      expect(create.statusCode).toBe(201);
      const created = create.json() as { id: string; status: string };
      expect(created.status).toBe('pending');

      const wd = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/suggestions/${created.id}/withdraw`,
        headers: { cookie },
      });
      expect(wd.statusCode).toBe(200);
      const after = wd.json() as { status: string };
      expect(after.status).toBe('withdrawn');
    });

    it('Lead accept wendet Ops an und erhöht draftRevision', async () => {
      const revRow = await prisma.document.findUnique({
        where: { id: publishedDocId },
        select: { draftRevision: true },
      });
      const rev = revRow!.draftRevision;
      const writerCookie = await loginAs(`writer-${TS}@example.com`);
      const create = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/suggestions`,
        headers: { cookie: writerCookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          baseDraftRevision: rev,
          ops: [{ op: 'deleteBlock', blockId: '550e8400-e29b-41d4-a716-446655440002' }],
        }),
      });
      expect(create.statusCode).toBe(201);
      const sid = (create.json() as { id: string }).id;

      const leadCookie = await loginAs(`scope-lead-${TS}@example.com`);
      const acc = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/suggestions/${sid}/accept`,
        headers: { cookie: leadCookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ comment: 'OK' }),
      });
      expect(acc.statusCode).toBe(200);
      const body = acc.json() as {
        draftRevision: number;
        suggestion: { status: string };
        blocks: { blocks: { id: string }[] };
      };
      expect(body.suggestion.status).toBe('accepted');
      expect(body.draftRevision).toBe(rev + 1);
      expect(body.blocks.blocks.map((b) => b.id)).not.toContain(
        '550e8400-e29b-41d4-a716-446655440002'
      );
    });

    it('Lead reject pending → 200', async () => {
      const revRow = await prisma.document.findUnique({
        where: { id: publishedDocId },
        select: { draftRevision: true },
      });
      const rev = revRow!.draftRevision;
      const writerCookie = await loginAs(`writer-${TS}@example.com`);
      const create = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/suggestions`,
        headers: { cookie: writerCookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          baseDraftRevision: rev,
          ops: [
            {
              op: 'insertAfter',
              afterBlockId: '550e8400-e29b-41d4-a716-446655440000',
              blocks: [
                {
                  id: 'reject-test-block',
                  type: 'paragraph',
                  content: [
                    {
                      id: 'reject-test-text',
                      type: 'text',
                      attrs: {},
                      meta: { text: 'x' },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      });
      expect(create.statusCode).toBe(201);
      const sid = (create.json() as { id: string }).id;

      const leadCookie = await loginAs(`scope-lead-${TS}@example.com`);
      const rej = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${publishedDocId}/suggestions/${sid}/reject`,
        headers: { cookie: leadCookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ comment: 'Passt nicht' }),
      });
      expect(rej.statusCode).toBe(200);
      const body = rej.json() as { status: string; comment: string | null };
      expect(body.status).toBe('rejected');
      expect(body.comment).toBe('Passt nicht');
    });
  });
});
