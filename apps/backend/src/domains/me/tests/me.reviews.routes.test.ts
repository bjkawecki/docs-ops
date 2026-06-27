import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentSuggestionStatus } from '../../../../generated/prisma/client.js';
import { prisma } from '../../../db.js';
import {
  createDocumentsTestContext,
  disposeDocumentsTestContext,
  type DocumentsTestContext,
} from '../../documents/tests/helpers/documentsTestContext.js';

describe('GET /api/v1/me/reviews', () => {
  let ctx: DocumentsTestContext;
  let suggestionId: string;

  beforeAll(async () => {
    ctx = await createDocumentsTestContext();
    const doc = await prisma.document.findUniqueOrThrow({
      where: { id: ctx.publishedDocId },
      select: { draftRevision: true },
    });
    const suggestion = await prisma.documentSuggestion.create({
      data: {
        documentId: ctx.publishedDocId,
        authorId: ctx.writerId,
        status: DocumentSuggestionStatus.pending,
        baseDraftRevision: doc.draftRevision,
        ops: [
          {
            op: 'replaceBlock',
            blockId: 'block-1',
            block: {
              id: 'block-1',
              type: 'paragraph',
              content: [{ id: 't1', type: 'text', meta: { text: 'New' } }],
            },
          },
        ],
      },
    });
    suggestionId = suggestion.id;
  });

  afterAll(async () => {
    if (suggestionId) {
      await prisma.documentSuggestion.deleteMany({ where: { id: suggestionId } });
    }
    await disposeDocumentsTestContext(ctx);
  });

  it('returns 401 without session', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/me/reviews' });
    expect(res.statusCode).toBe(401);
  });

  it('lead sees pending suggestion in pendingForReview', async () => {
    const cookie = await ctx.loginAsScopeLead();
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me/reviews',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      pendingForReview: Array<{ suggestionId: string; documentId: string }>;
      totalPendingForReview: number;
    };
    expect(body.totalPendingForReview).toBeGreaterThanOrEqual(1);
    expect(body.pendingForReview.some((row) => row.suggestionId === suggestionId)).toBe(true);
    expect(body.pendingForReview.some((row) => row.documentId === ctx.publishedDocId)).toBe(true);
  });

  it('author sees own suggestion in mySuggestions', async () => {
    const cookie = await ctx.loginAsWriter();
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me/reviews',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      mySuggestions: Array<{ suggestionId: string }>;
      totalMySuggestions: number;
      pendingForReview: unknown[];
    };
    expect(body.totalMySuggestions).toBeGreaterThanOrEqual(1);
    expect(body.mySuggestions.some((row) => row.suggestionId === suggestionId)).toBe(true);
    expect(body.pendingForReview).toEqual([]);
  });

  it('reader-only sees empty lists', async () => {
    const cookie = await ctx.loginAsReaderOnly();
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/me/reviews',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      pendingForReview: unknown[];
      mySuggestions: unknown[];
    };
    expect(body.pendingForReview).toEqual([]);
    expect(body.mySuggestions).toEqual([]);
  });
});
