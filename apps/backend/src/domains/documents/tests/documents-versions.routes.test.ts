import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../db.js';
import {
  createDocumentsTestContext,
  disposeDocumentsTestContext,
  type DocumentsTestContext,
} from './helpers/documentsTestContext.js';

describe('Documents routes / versions', () => {
  let context: DocumentsTestContext;

  beforeAll(async () => {
    context = await createDocumentsTestContext();
  });

  afterAll(async () => {
    await disposeDocumentsTestContext(context);
  });

  it('GET /documents/:documentId/versions ohne Auth -> 401', async () => {
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/versions`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /documents/:documentId/versions mit Auth -> 200', async () => {
    const cookie = await context.loginAsWriter();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/versions`,
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

  it('GET /documents/:documentId/versions read-only -> 403', async () => {
    const cookie = await context.loginAsReaderOnly();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/versions`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /documents/:documentId/versions/:versionId mit Auth -> 200', async () => {
    const version = await prisma.documentVersion.findFirst({
      where: { documentId: context.publishedDocId },
      select: { id: true },
    });
    const cookie = await context.loginAsWriter();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/versions/${version!.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { content: string; versionNumber: number };
    expect(body).toHaveProperty('content');
    expect(body.versionNumber).toBe(1);
  });

  it('GET /documents/:documentId/versions/:versionId read-only -> 403', async () => {
    const version = await prisma.documentVersion.findFirst({
      where: { documentId: context.publishedDocId },
      select: { id: true },
    });
    const cookie = await context.loginAsReaderOnly();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/versions/${version!.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });
});
