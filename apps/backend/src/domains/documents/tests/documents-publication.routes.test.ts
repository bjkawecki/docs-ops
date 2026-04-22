import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DocumentSuggestionStatus, GrantRole } from '../../../../generated/prisma/client.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { prisma } from '../../../db.js';
import { exampleBlockDocumentV0 } from '../services/blocks/blockSchema.js';
import {
  createDocumentsTestContext,
  disposeDocumentsTestContext,
  type DocumentsTestContext,
} from './helpers/documentsTestContext.js';

describe('Documents routes / publication', () => {
  let context: DocumentsTestContext;

  beforeAll(async () => {
    context = await createDocumentsTestContext();
  });

  afterAll(async () => {
    await disposeDocumentsTestContext(context);
  });

  it('POST /documents/:documentId/publish ohne Auth -> 401', async () => {
    const res = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.draftDocId}/publish`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /documents/:documentId/publish als Scope-Lead -> 200', async () => {
    const cookie = await context.loginAsScopeLead();
    const res = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.draftDocId}/publish`,
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
      where: { id: context.draftDocId },
      select: { publishedAt: true, currentPublishedVersionId: true },
    });
    expect(doc?.publishedAt).not.toBeNull();
    expect(doc?.currentPublishedVersionId).not.toBeNull();

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: context.draftDocId },
      select: { versionNumber: true },
    });
    expect(versions.some((version) => version.versionNumber === 1)).toBe(true);
  });

  it('POST /documents/:documentId/publish erneut -> 409', async () => {
    const cookie = await context.loginAsScopeLead();
    const res = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.draftDocId}/publish`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
  });

  it('Publish mit Lead-Draft-Blocks: Version.blocks aus Draft; pending -> superseded', async () => {
    let ephemeralId: string | null = null;
    try {
      const document = await prisma.document.create({
        data: {
          title: `Publish from draft blocks ${Date.now()}`,
          contextId: context.contextId,
          draftBlocks: exampleBlockDocumentV0 as unknown as Prisma.InputJsonValue,
          draftRevision: 1,
        },
      });
      ephemeralId = document.id;
      await prisma.documentGrantUser.createMany({
        data: [{ documentId: ephemeralId, userId: context.writerId, role: GrantRole.Write }],
      });
      const suggestion = await prisma.documentSuggestion.create({
        data: {
          documentId: ephemeralId,
          authorId: context.writerId,
          status: DocumentSuggestionStatus.pending,
          baseDraftRevision: 1,
          ops: [
            { op: 'deleteBlock', blockId: '550e8400-e29b-41d4-a716-446655440002' },
          ] as unknown as Prisma.InputJsonValue,
        },
      });

      const cookie = await context.loginAsScopeLead();
      const res = await context.app.inject({
        method: 'POST',
        url: `/api/v1/documents/${ephemeralId}/publish`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);

      const versionOne = await prisma.documentVersion.findFirst({
        where: { documentId: ephemeralId, versionNumber: 1 },
        select: { blocks: true },
      });
      expect(JSON.parse(JSON.stringify(versionOne?.blocks))).toEqual(exampleBlockDocumentV0);

      const suggestionRow = await prisma.documentSuggestion.findUnique({
        where: { id: suggestion.id },
        select: { status: true },
      });
      expect(suggestionRow?.status).toBe(DocumentSuggestionStatus.superseded);
    } finally {
      if (ephemeralId) {
        await prisma.document.deleteMany({ where: { id: ephemeralId } });
      }
    }
  });
});
