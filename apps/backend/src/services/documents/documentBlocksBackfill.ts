import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import { markdownToBlockDocumentV0 } from './markdownToBlocks.js';
import { safeParseBlockDocumentV0, type BlockDocumentV0, type BlockNode } from './blockSchema.js';

function seedTextLeaf(text: string): BlockNode {
  return { id: randomUUID(), type: 'text', attrs: {}, meta: { text } };
}

/** Abschnitte für {@link blockDocumentJsonFromSeedSections} (ohne Markdown-Quelltext). */
export type SeedDocumentBlockSection =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: 'paragraph'; text: string };

/**
 * Block-JSON für Seed/Fixtures: Überschriften und Absätze als v0-Knoten, ohne Markdown-String.
 */
export function blockDocumentJsonFromSeedSections(
  sections: SeedDocumentBlockSection[]
): Prisma.InputJsonValue {
  const blocks: BlockNode[] = [];
  for (const s of sections) {
    if (s.type === 'heading') {
      blocks.push({
        id: randomUUID(),
        type: 'heading',
        attrs: { level: s.level },
        content: [seedTextLeaf(s.text)],
      });
    } else {
      blocks.push({
        id: randomUUID(),
        type: 'paragraph',
        content: [seedTextLeaf(s.text)],
      });
    }
  }
  if (blocks.length === 0) {
    blocks.push({ id: randomUUID(), type: 'paragraph', content: [seedTextLeaf('')] });
  }
  const doc: BlockDocumentV0 = { schemaVersion: 0, blocks };
  return doc as unknown as Prisma.InputJsonValue;
}

/** JSON payload für `Document.draftBlocks` / `DocumentVersion.blocks` (BlockDocument v0). */
export function blockDocumentJsonFromMarkdown(markdown: string): Prisma.InputJsonValue {
  return markdownToBlockDocumentV0(markdown) as unknown as Prisma.InputJsonValue;
}

/** Wie {@link blockDocumentJsonFromMarkdown}, aber für reinen Text ohne Markdown-Syntax (Absätze per `\n\n`). */
export function blockDocumentJsonFromPlainText(plain: string): Prisma.InputJsonValue {
  return markdownToBlockDocumentV0(
    plain.replace(/\r\n/g, '\n')
  ) as unknown as Prisma.InputJsonValue;
}

/** Leeres Block-Dokument (ein leerer Absatz) für neue Dokumente / Defaults. */
export function emptyBlockDocumentJson(): Prisma.InputJsonValue {
  return markdownToBlockDocumentV0('') as unknown as Prisma.InputJsonValue;
}

/** Parst DB-JSON zu BlockDocument v0; bei ungültigem JSON `null`. */
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
 * EPIC-9b: Markdown-Spalte entfernt — Backfill aus DB-`content` entfällt (no-op, Job bleibt idempotent).
 */
export async function backfillDocumentVersionBlocks(
  prisma: PrismaClient,
  opts?: BackfillDocumentBlocksOptions
): Promise<{ updated: number; documentIds: string[] }> {
  void prisma;
  void opts;
  await Promise.resolve();
  return { updated: 0, documentIds: [] };
}

/** EPIC-9b: siehe `backfillDocumentVersionBlocks`. */
export async function backfillDocumentDraftBlocks(
  prisma: PrismaClient,
  opts?: BackfillDocumentBlocksOptions
): Promise<{ updated: number; documentIds: string[] }> {
  void prisma;
  void opts;
  await Promise.resolve();
  return { updated: 0, documentIds: [] };
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
