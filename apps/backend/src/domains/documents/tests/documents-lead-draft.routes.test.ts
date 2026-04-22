import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exampleBlockDocumentV0 } from '../services/blocks/blockSchema.js';
import {
  createDocumentsTestContext,
  disposeDocumentsTestContext,
  type DocumentsTestContext,
} from './helpers/documentsTestContext.js';

describe('Documents routes / lead-draft', () => {
  let context: DocumentsTestContext;

  beforeAll(async () => {
    context = await createDocumentsTestContext();
  });

  afterAll(async () => {
    await disposeDocumentsTestContext(context);
  });

  it('GET /documents/:documentId/lead-draft ohne Auth -> 401', async () => {
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/lead-draft`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('Read-only GET lead-draft -> 403', async () => {
    const cookie = await context.loginAsReaderOnly();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/lead-draft`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Writer GET lead-draft -> 200, canEdit false', async () => {
    const cookie = await context.loginAsWriter();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/lead-draft`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { draftRevision: number; canEdit: boolean };
    expect(body.canEdit).toBe(false);
    expect(body.draftRevision).toBe(0);
  });

  it('Scope-Lead GET lead-draft -> 200, canEdit true', async () => {
    const cookie = await context.loginAsScopeLead();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/lead-draft`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { canEdit: boolean };
    expect(body.canEdit).toBe(true);
  });

  it('Writer PATCH lead-draft -> 403', async () => {
    const cookie = await context.loginAsWriter();
    const res = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${context.publishedDocId}/lead-draft`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        expectedRevision: 0,
        blocks: exampleBlockDocumentV0,
      }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('Lead PATCH mit falscher expectedRevision -> 409', async () => {
    const cookie = await context.loginAsScopeLead();
    const res = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${context.publishedDocId}/lead-draft`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        expectedRevision: 99,
        blocks: exampleBlockDocumentV0,
      }),
    });
    expect(res.statusCode).toBe(409);
  });

  it('Lead PATCH expectedRevision 0 -> 200, Revision 1', async () => {
    const cookie = await context.loginAsScopeLead();
    const res = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${context.publishedDocId}/lead-draft`,
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

  it('Lead PATCH expectedRevision 0 erneut -> 409', async () => {
    const cookie = await context.loginAsScopeLead();
    const res = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${context.publishedDocId}/lead-draft`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        expectedRevision: 0,
        blocks: exampleBlockDocumentV0,
      }),
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH mit widersprüchlichem If-Match zu expectedRevision -> 400', async () => {
    const cookie = await context.loginAsScopeLead();
    const res = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${context.publishedDocId}/lead-draft`,
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

  it('PATCH mit expectedRevision 1 -> 200, Revision 2', async () => {
    const cookie = await context.loginAsScopeLead();
    const res = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${context.publishedDocId}/lead-draft`,
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
