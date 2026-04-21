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
  /** Betroffene Dokument-IDs (EPIC-7b: Search-Reindex). */
  affectedDocumentIds: string[];
};

/**
 * Idempotent (EPIC-3 / PR-3a): füllt `DocumentVersion.blocks` + `blocksSchemaVersion` aus Markdown-`content`,
 * solange `blocks` noch null ist.
 */
export async function backfillDocumentVersionBlocks(
  prisma: PrismaClient,
  opts?: BackfillDocumentBlocksOptions
): Promise<{ updated: number; documentIds: string[] }> {
  const take = opts?.limit ?? 200;
  const rows = await prisma.documentVersion.findMany({
    where: {
      blocks: { equals: Prisma.DbNull },
      ...(opts?.documentId != null ? { documentId: opts.documentId } : {}),
    },
    take,
    select: { id: true, content: true, documentId: true },
  });

  const documentIds: string[] = [];
  let updated = 0;
  for (const row of rows) {
    const json = blockDocumentJsonFromMarkdown(row.content);
    await prisma.documentVersion.update({
      where: { id: row.id },
      data: { blocks: json, blocksSchemaVersion: 0 },
    });
    documentIds.push(row.documentId);
    updated += 1;
  }
  return { updated, documentIds };
}

/**
 * PR-3c: `Document.draftBlocks` aus aktuellem Markdown-`content`, wenn noch leer.
 */
export async function backfillDocumentDraftBlocks(
  prisma: PrismaClient,
  opts?: BackfillDocumentBlocksOptions
): Promise<{ updated: number; documentIds: string[] }> {
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

  const documentIds: string[] = [];
  let updated = 0;
  for (const row of rows) {
    const json = blockDocumentJsonFromMarkdown(row.content);
    await prisma.document.update({
      where: { id: row.id },
      data: { draftBlocks: json },
    });
    documentIds.push(row.id);
    updated += 1;
  }
  return { updated, documentIds };
}

/** Versionen zuerst, dann Draft-Spalten am Dokument (eine Job-/Script-Runde). */
export async function backfillAllDocumentBlocks(
  prisma: PrismaClient,
  opts?: BackfillDocumentBlocksOptions
): Promise<BackfillDocumentBlocksResult> {
  const v = await backfillDocumentVersionBlocks(prisma, opts);
  const d = await backfillDocumentDraftBlocks(prisma, opts);
  const affectedDocumentIds = [...new Set([...v.documentIds, ...d.documentIds])];
  return {
    documentVersionsUpdated: v.updated,
    documentsDraftUpdated: d.updated,
    affectedDocumentIds,
  };
}
