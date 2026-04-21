import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import { safeParseBlockDocumentV0, type BlockDocumentV0 } from './blockSchema.js';
import { parseBlockDocumentFromDb } from './documentBlocksBackfill.js';

export type LeadDraftView = {
  draftRevision: number;
  blocks: BlockDocumentV0 | null;
  canEdit: boolean;
};

export type GetLeadDraftResult =
  | { ok: true; view: LeadDraftView }
  | { ok: false; error: 'not_found' | 'forbidden' };

export async function getLeadDraftForUser(
  prisma: PrismaClient,
  documentId: string,
  opts: { canReadLead: boolean; canEdit: boolean }
): Promise<GetLeadDraftResult> {
  if (!opts.canReadLead) return { ok: false, error: 'forbidden' };
  const doc = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { draftRevision: true, draftBlocks: true },
  });
  if (!doc) return { ok: false, error: 'not_found' };
  return {
    ok: true,
    view: {
      draftRevision: doc.draftRevision,
      blocks: parseBlockDocumentFromDb(doc.draftBlocks),
      canEdit: opts.canEdit,
    },
  };
}

export type PatchLeadDraftInput = {
  blocks: unknown;
  expectedRevision: number;
};

export type PatchLeadDraftResult =
  | { ok: true; draftRevision: number; blocks: BlockDocumentV0 }
  | { ok: false; error: 'not_found' | 'conflict' | 'validation'; issues?: unknown };

/**
 * Atomarer Compare-and-Swap auf `draftRevision` (409 bei Konflikt).
 */
export async function patchLeadDraft(
  prisma: PrismaClient,
  documentId: string,
  input: PatchLeadDraftInput
): Promise<PatchLeadDraftResult> {
  const safe = safeParseBlockDocumentV0(input.blocks);
  if (!safe.success) {
    return { ok: false, error: 'validation', issues: safe.error.flatten() };
  }
  const parsed = safe.data;
  const json = parsed as unknown as Prisma.InputJsonValue;

  const updated = await prisma.document.updateMany({
    where: {
      id: documentId,
      deletedAt: null,
      draftRevision: input.expectedRevision,
    },
    data: {
      draftBlocks: json,
      draftRevision: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    const row = await prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: { id: true, draftRevision: true },
    });
    if (!row) return { ok: false, error: 'not_found' };
    return { ok: false, error: 'conflict' };
  }

  const after = await prisma.document.findUnique({
    where: { id: documentId },
    select: { draftRevision: true },
  });
  const revision = after?.draftRevision ?? input.expectedRevision + 1;
  return { ok: true, draftRevision: revision, blocks: parsed };
}
