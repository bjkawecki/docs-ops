import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import { markdownToBlockDocumentV0 } from './markdownToBlocks.js';
import { safeParseBlockDocumentV0, type BlockDocumentV0 } from './blockSchema.js';

/** JSON payload für `Document.draftBlocks` / `DocumentVersion.blocks` (BlockDocument v0). */
export function blockDocumentJsonFromMarkdown(markdown: string): Prisma.InputJsonValue {
  return markdownToBlockDocumentV0(markdown) as unknown as Prisma.InputJsonValue;
}

/** Parst DB-JSON zu BlockDocument v0; bei ungültigem JSON `null` (GET-Fallback bleibt Markdown). */
export function parseBlockDocumentFromDb(value: unknown): BlockDocumentV0 | null {
  if (value == null) return null;
  const r = safeParseBlockDocumentV0(value);
  return r.success ? r.data : null;
}

export type BackfillDocumentBlocksOptions = {
  /** Nur diese Document-ID (Versionen + Draft dieses Docs). */
  documentId?: string;
  /** Max. Zeilen pro Teil-Stapel (Versionen bzw. Dokumente). */
  limit?: number;
};

export type BackfillDocumentBlocksResult = {
  documentVersionsUpdated: number;
  documentsDraftUpdated: number;
};

/**
 * Idempotent (EPIC-3 / PR-3a): füllt `DocumentVersion.blocks` + `blocksSchemaVersion` aus Markdown-`content`,
 * solange `blocks` noch null ist.
 */
export async function backfillDocumentVersionBlocks(
  prisma: PrismaClient,
  opts?: BackfillDocumentBlocksOptions
): Promise<number> {
  const take = opts?.limit ?? 200;
  const rows = await prisma.documentVersion.findMany({
    where: {
      blocks: { equals: Prisma.DbNull },
      ...(opts?.documentId != null ? { documentId: opts.documentId } : {}),
    },
    take,
    select: { id: true, content: true },
  });

  let updated = 0;
  for (const row of rows) {
    const json = blockDocumentJsonFromMarkdown(row.content);
    await prisma.documentVersion.update({
      where: { id: row.id },
      data: { blocks: json, blocksSchemaVersion: 0 },
    });
    updated += 1;
  }
  return updated;
}

/**
 * PR-3c: `Document.draftBlocks` aus aktuellem Markdown-`content`, wenn noch leer.
 */
export async function backfillDocumentDraftBlocks(
  prisma: PrismaClient,
  opts?: BackfillDocumentBlocksOptions
): Promise<number> {
  const take = opts?.limit ?? 200;
  const rows = await prisma.document.findMany({
    where: {
      draftBlocks: { equals: Prisma.DbNull },
      deletedAt: null,
      ...(opts?.documentId != null ? { id: opts.documentId } : {}),
    },
    take,
    select: { id: true, content: true },
  });

  let updated = 0;
  for (const row of rows) {
    const json = blockDocumentJsonFromMarkdown(row.content);
    await prisma.document.update({
      where: { id: row.id },
      data: { draftBlocks: json },
    });
    updated += 1;
  }
  return updated;
}

/** Versionen zuerst, dann Draft-Spalten am Dokument (eine Job-/Script-Runde). */
export async function backfillAllDocumentBlocks(
  prisma: PrismaClient,
  opts?: BackfillDocumentBlocksOptions
): Promise<BackfillDocumentBlocksResult> {
  const documentVersionsUpdated = await backfillDocumentVersionBlocks(prisma, opts);
  const documentsDraftUpdated = await backfillDocumentDraftBlocks(prisma, opts);
  return { documentVersionsUpdated, documentsDraftUpdated };
}
