import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../db.js';
import { blockDocumentJsonFromMarkdown } from '../services/blocks/documentBlocksBackfill.js';
import {
  createDocumentsTestContext,
  disposeDocumentsTestContext,
  type DocumentsTestContext,
} from './helpers/documentsTestContext.js';

describe('Documents routes / comments', () => {
  let context: DocumentsTestContext;

  beforeAll(async () => {
    context = await createDocumentsTestContext();
  });

  afterAll(async () => {
    await disposeDocumentsTestContext(context);
  });

  it('Writer POST comment -> 201; GET list -> 200 with canDelete', async () => {
    const cookie = await context.loginAsWriter();
    const post = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: '  First comment  ' }),
    });
    expect(post.statusCode).toBe(201);
    const created = post.json() as { id: string; text: string; canDelete: boolean };
    expect(created.text).toBe('First comment');
    expect(created.canDelete).toBe(true);

    const list = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/comments?limit=20&offset=0`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as {
      items: { id: string; canDelete: boolean; authorName: string }[];
      total: number;
    };
    expect(body.total).toBeGreaterThanOrEqual(1);
    const row = body.items.find((item) => item.id === created.id);
    expect(row).toBeDefined();
    expect(row!.canDelete).toBe(true);
    expect(row!.authorName).toBe('Writer');
  });

  it('POST with unknown body key -> 400', async () => {
    const cookie = await context.loginAsWriter();
    const res = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'x', notAField: true }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST reply to root -> 201; GET lists nested replies', async () => {
    const cookie = await context.loginAsWriter();
    const root = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'Root for thread' }),
    });
    expect(root.statusCode).toBe(201);
    const rootId = (root.json() as { id: string }).id;

    const reply = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'Nested reply', parentId: rootId }),
    });
    expect(reply.statusCode).toBe(201);
    expect((reply.json() as { parentId: string }).parentId).toBe(rootId);

    const list = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/comments?limit=50&offset=0`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as {
      items: Array<{ id: string; replies: { id: string; text: string }[] }>;
    };
    const item = body.items.find((entry) => entry.id === rootId);
    expect(item).toBeDefined();
    expect(item!.replies.some((entry) => entry.text === 'Nested reply')).toBe(true);
  });

  it('POST reply to reply -> 400', async () => {
    const cookie = await context.loginAsWriter();
    const root = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'Root B' }),
    });
    const rootId = (root.json() as { id: string }).id;
    const reply = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'First reply', parentId: rootId }),
    });
    const replyId = (reply.json() as { id: string }).id;
    const bad = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'Too deep', parentId: replyId }),
    });
    expect(bad.statusCode).toBe(400);
  });

  it('POST with invalid anchorHeadingId -> 400', async () => {
    await prisma.document.update({
      where: { id: context.publishedDocId },
      data: { draftBlocks: blockDocumentJsonFromMarkdown('# Intro\n\nPublished content') },
    });
    const cookie = await context.loginAsWriter();
    const res = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'Anchored', anchorHeadingId: 'no-such-heading-slug' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST with anchorHeadingId matching document heading -> 201', async () => {
    await prisma.document.update({
      where: { id: context.publishedDocId },
      data: { draftBlocks: blockDocumentJsonFromMarkdown('# Intro\n\nPublished content') },
    });
    const cookie = await context.loginAsWriter();
    const res = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'In section', anchorHeadingId: 'intro' }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { anchorHeadingId: string | null };
    expect(body.anchorHeadingId).toBe('intro');
  });

  it('Writer PATCH own comment -> 200; PATCH other -> 403', async () => {
    const cookie = await context.loginAsWriter();
    const post = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'to patch' }),
    });
    expect(post.statusCode).toBe(201);
    const { id: commentId } = post.json() as { id: string };

    const patch = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${context.publishedDocId}/comments/${commentId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'updated' }),
    });
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as { text: string }).text).toBe('updated');

    const leadCookie = await context.loginAsScopeLead();
    const leadPost = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie: leadCookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'by lead' }),
    });
    expect(leadPost.statusCode).toBe(201);
    const leadCommentId = (leadPost.json() as { id: string }).id;

    const forbidden = await context.app.inject({
      method: 'PATCH',
      url: `/api/v1/documents/${context.publishedDocId}/comments/${leadCommentId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'hijack' }),
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('Department lead DELETE writer comment -> 204', async () => {
    const writerCookie = await context.loginAsWriter();
    const post = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie: writerCookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'delete me' }),
    });
    expect(post.statusCode).toBe(201);
    const commentId = (post.json() as { id: string }).id;

    const leadCookie = await context.loginAsScopeLead();
    const del = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${context.publishedDocId}/comments/${commentId}`,
      headers: { cookie: leadCookie },
    });
    expect(del.statusCode).toBe(204);
  });

  it('Writer cannot DELETE lead comment -> 403', async () => {
    const leadCookie = await context.loginAsScopeLead();
    const post = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie: leadCookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'lead owned' }),
    });
    expect(post.statusCode).toBe(201);
    const commentId = (post.json() as { id: string }).id;

    const writerCookie = await context.loginAsWriter();
    const del = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${context.publishedDocId}/comments/${commentId}`,
      headers: { cookie: writerCookie },
    });
    expect(del.statusCode).toBe(403);
  });

  it('DELETE root soft-deletes parent; replies remain in DB and in GET', async () => {
    const cookie = await context.loginAsWriter();
    const root = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'Root soft' }),
    });
    const rootId = (root.json() as { id: string }).id;
    await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'Child stays', parentId: rootId }),
    });
    const before = await prisma.documentComment.count({
      where: { documentId: context.publishedDocId },
    });
    expect(before).toBeGreaterThanOrEqual(2);

    const del = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${context.publishedDocId}/comments/${rootId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
    const after = await prisma.documentComment.count({
      where: { documentId: context.publishedDocId },
    });
    expect(after).toBe(before);

    const row = await prisma.documentComment.findUnique({ where: { id: rootId } });
    expect(row?.deletedAt).not.toBeNull();

    const list = await context.app.inject({
      method: 'GET',
      url: `/api/v1/documents/${context.publishedDocId}/comments?limit=50&offset=0`,
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
    const item = body.items.find((entry) => entry.id === rootId);
    expect(item).toBeDefined();
    expect(item!.deletedAt).not.toBeNull();
    expect(item!.text).toBe('');
    expect(item!.replies.some((entry) => entry.text === 'Child stays')).toBe(true);
  });

  it('DELETE root again -> 409 already removed', async () => {
    const cookie = await context.loginAsWriter();
    const root = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'Root twice' }),
    });
    const rootId = (root.json() as { id: string }).id;
    const first = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${context.publishedDocId}/comments/${rootId}`,
      headers: { cookie },
    });
    expect(first.statusCode).toBe(204);
    const second = await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${context.publishedDocId}/comments/${rootId}`,
      headers: { cookie },
    });
    expect(second.statusCode).toBe(409);
  });

  it('POST reply when parent root is soft-deleted -> 400', async () => {
    const cookie = await context.loginAsWriter();
    const root = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'Root for reply block' }),
    });
    const rootId = (root.json() as { id: string }).id;
    await context.app.inject({
      method: 'DELETE',
      url: `/api/v1/documents/${context.publishedDocId}/comments/${rootId}`,
      headers: { cookie },
    });
    const reply = await context.app.inject({
      method: 'POST',
      url: `/api/v1/documents/${context.publishedDocId}/comments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'Too late', parentId: rootId }),
    });
    expect(reply.statusCode).toBe(400);
  });
});
