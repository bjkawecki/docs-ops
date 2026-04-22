import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { prisma } from '../../../db.js';
import { exampleBlockDocumentV0 } from '../services/blocks/blockSchema.js';
import {
  createDocumentsTestContext,
  disposeDocumentsTestContext,
  type DocumentsTestContext,
} from './helpers/documentsTestContext.js';

describe('Documents routes / suggestions', () => {
  let context: DocumentsTestContext;

  beforeAll(async () => {
    context = await createDocumentsTestContext();
    await prisma.document.update({
      where: { id: context.publishedDocId },
      data: {
        draftBlocks: exampleBlockDocumentV0 as unknown as Prisma.InputJsonValue,
        draftRevision: 0,
      },
    });
  });

  afterAll(async () => {
    await disposeDocumentsTestContext(context);
  });

  it('Read-only GET suggestions -> 403', async () => {
    const cookie = await context.loginAsReaderOnly();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/suggestions`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Writer GET suggestions -> 200', async () => {
    const cookie = await context.loginAsWriter();
    const res = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/suggestions`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('Writer POST mit falscher baseDraftRevision -> 409', async () => {
    const cookie = await context.loginAsWriter();
    const res = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/suggestions`,
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

  it('Writer POST gueltige Suggestion -> 201; withdraw -> 200', async () => {
    const revisionRow = await prisma.document.findUnique({
      where: { id: context.publishedDocId },
      select: { draftRevision: true },
    });
    const cookie = await context.loginAsWriter();
    const create = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/suggestions`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        baseDraftRevision: revisionRow!.draftRevision,
        ops: [{ op: 'deleteBlock', blockId: '550e8400-e29b-41d4-a716-446655440002' }],
      }),
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as { id: string; status: string };
    expect(created.status).toBe('pending');

    const withdraw = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/suggestions/${created.id}/withdraw`,
      headers: { cookie },
    });
    expect(withdraw.statusCode).toBe(200);
    const after = withdraw.json() as { status: string };
    expect(after.status).toBe('withdrawn');
  });

  it('Lead accept wendet Ops an und erhoeht draftRevision', async () => {
    const revisionRow = await prisma.document.findUnique({
      where: { id: context.publishedDocId },
      select: { draftRevision: true },
    });
    const writerCookie = await context.loginAsWriter();
    const create = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/suggestions`,
      headers: { cookie: writerCookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        baseDraftRevision: revisionRow!.draftRevision,
        ops: [{ op: 'deleteBlock', blockId: '550e8400-e29b-41d4-a716-446655440002' }],
      }),
    });
    expect(create.statusCode).toBe(201);
    const suggestionId = (create.json() as { id: string }).id;

    const leadCookie = await context.loginAsScopeLead();
    const accept = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/suggestions/${suggestionId}/accept`,
      headers: { cookie: leadCookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ comment: 'OK' }),
    });
    expect(accept.statusCode).toBe(200);
    const body = accept.json() as {
      draftRevision: number;
      suggestion: { status: string };
      blocks: { blocks: { id: string }[] };
    };
    expect(body.suggestion.status).toBe('accepted');
    expect(body.draftRevision).toBe(revisionRow!.draftRevision + 1);
    expect(body.blocks.blocks.map((block) => block.id)).not.toContain(
      '550e8400-e29b-41d4-a716-446655440002'
    );
  });

  it('Lead reject pending -> 200', async () => {
    const revisionRow = await prisma.document.findUnique({
      where: { id: context.publishedDocId },
      select: { draftRevision: true },
    });
    const writerCookie = await context.loginAsWriter();
    const create = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/suggestions`,
      headers: { cookie: writerCookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        baseDraftRevision: revisionRow!.draftRevision,
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
    const suggestionId = (create.json() as { id: string }).id;

    const leadCookie = await context.loginAsScopeLead();
    const reject = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/suggestions/${suggestionId}/reject`,
      headers: { cookie: leadCookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ comment: 'Passt nicht' }),
    });
    expect(reject.statusCode).toBe(200);
    const body = reject.json() as { status: string; comment: string | null };
    expect(body.status).toBe('rejected');
    expect(body.comment).toBe('Passt nicht');
  });
});
