import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../db.js';
import { hashPassword } from '../../auth/password.js';
import {
  backfillDocumentDraftBlocks,
  backfillDocumentVersionBlocks,
  parseBlockDocumentFromDb,
} from './documentBlocksBackfill.js';

const TS = `blkbf-${Date.now()}`;

describe('documentBlocksBackfill (EPIC-3)', () => {
  let userId: string;
  let documentId: string;
  let versionId: string;

  beforeAll(async () => {
    const pw = await hashPassword('test');
    const u = await prisma.user.create({
      data: { name: 'Backfill', email: `${TS}@example.com`, passwordHash: pw },
    });
    userId = u.id;
    const d = await prisma.document.create({
      data: { title: 'Backfill doc', content: '# Hello\n\nWorld.', createdById: userId },
    });
    documentId = d.id;
    const v = await prisma.documentVersion.create({
      data: { documentId, content: '# Version\n\nLine.', versionNumber: 1 },
    });
    versionId = v.id;
  });

  afterAll(async () => {
    await prisma.documentVersion.deleteMany({ where: { documentId } });
    await prisma.document.delete({ where: { id: documentId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it('PR-3a: fills DocumentVersion.blocks from markdown', async () => {
    const r = await backfillDocumentVersionBlocks(prisma, { documentId, limit: 50 });
    expect(r.updated).toBeGreaterThanOrEqual(1);
    const v = await prisma.documentVersion.findUnique({ where: { id: versionId } });
    expect(v?.blocks).not.toBeNull();
    const parsed = parseBlockDocumentFromDb(v?.blocks);
    expect(parsed?.schemaVersion).toBe(0);
    expect(parsed?.blocks.some((b) => b.type === 'heading')).toBe(true);
  });

  it('PR-3c: fills Document.draftBlocks from markdown', async () => {
    const r = await backfillDocumentDraftBlocks(prisma, { documentId, limit: 50 });
    expect(r.updated).toBeGreaterThanOrEqual(1);
    const d = await prisma.document.findUnique({ where: { id: documentId } });
    expect(d?.draftBlocks).not.toBeNull();
    const parsed = parseBlockDocumentFromDb(d?.draftBlocks);
    expect(parsed?.blocks[0]?.type).toBe('heading');
  });
});
