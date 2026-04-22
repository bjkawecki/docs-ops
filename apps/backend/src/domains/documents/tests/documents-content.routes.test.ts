import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDocumentsTestContext,
  disposeDocumentsTestContext,
  type DocumentsTestContext,
} from './helpers/documentsTestContext.js';

describe('Documents routes / content-storage', () => {
  let context: DocumentsTestContext;

  beforeAll(async () => {
    context = await createDocumentsTestContext();
  });

  afterAll(async () => {
    await disposeDocumentsTestContext(context);
  });

  it('GET /documents/:documentId/pdf ohne pdfUrl -> 404', async () => {
    const cookie = await context.loginAsWriter();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/pdf`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error?: string };
    expect(body.error).toBe('PDF not available');
  });

  it('POST /documents/:documentId/attachments ohne storage -> 503', async () => {
    const cookie = await context.loginAsWriter();
    const res = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/attachments`,
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
