import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDocumentsTestContext,
  disposeDocumentsTestContext,
  type DocumentsTestContext,
} from './helpers/documentsTestContext.js';

describe('Documents routes / catalog', () => {
  let context: DocumentsTestContext;

  beforeAll(async () => {
    context = await createDocumentsTestContext();
  });

  afterAll(async () => {
    await disposeDocumentsTestContext(context);
  });

  it('GET /documents sortBy=contextName -> 200 mit contextName', async () => {
    const cookie = await context.loginAsScopeLead();
    const res = await context.app.inject({
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
