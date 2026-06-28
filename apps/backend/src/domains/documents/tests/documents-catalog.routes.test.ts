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

  it('department author sees published documents in department catalog scope', async () => {
    const cookie = await context.loginAsScopeAuthor();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents?departmentId=${context.departmentId}&limit=50`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: { id: string }[]; total: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items.some((item) => item.id === context.publishedDocId)).toBe(true);
  });

  it('department author sees drafts in department scope via GET /me/drafts', async () => {
    const cookie = await context.loginAsScopeAuthor();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/me/drafts?departmentId=${context.departmentId}&limit=50`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { draftDocuments: { id: string }[]; total: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.draftDocuments.some((item) => item.id === context.draftDocId)).toBe(true);
  });

  it('department author has can-write-in-scope for their department', async () => {
    const cookie = await context.loginAsScopeAuthor();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/me/can-write-in-scope?scope=department&departmentId=${context.departmentId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ canWrite: true });
  });
});
