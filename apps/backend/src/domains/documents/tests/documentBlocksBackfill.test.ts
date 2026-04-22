import { describe, it, expect } from 'vitest';
import { prisma } from '../../../db.js';
import {
  backfillDocumentDraftBlocks,
  backfillDocumentVersionBlocks,
  blockDocumentJsonFromPlainText,
  blockDocumentJsonFromSeedSections,
  parseBlockDocumentFromDb,
} from '../services/blocks/documentBlocksBackfill.js';
import { exampleBlockDocumentV0 } from '../services/blocks/blockSchema.js';

describe('documentBlocksBackfill (EPIC-9b)', () => {
  it('backfillDocumentVersionBlocks ist No-op ohne Markdown-Spalte', async () => {
    const r = await backfillDocumentVersionBlocks(prisma, {});
    expect(r.updated).toBe(0);
  });

  it('backfillDocumentDraftBlocks ist No-op ohne Markdown-Spalte', async () => {
    const r = await backfillDocumentDraftBlocks(prisma, {});
    expect(r.updated).toBe(0);
  });

  it('parseBlockDocumentFromDb parst gültiges JSON', () => {
    const p = parseBlockDocumentFromDb(exampleBlockDocumentV0);
    expect(p?.schemaVersion).toBe(0);
  });

  it('blockDocumentJsonFromPlainText erzeugt Absätze ohne Markdown-Zeichen', () => {
    const json = blockDocumentJsonFromPlainText('Erster Absatz.\n\nZweiter Absatz.');
    const doc = parseBlockDocumentFromDb(json);
    expect(doc?.blocks).toHaveLength(2);
    expect(doc?.blocks.every((b) => b.type === 'paragraph')).toBe(true);
  });

  it('blockDocumentJsonFromSeedSections erzeugt Überschriften und Absätze', () => {
    const json = blockDocumentJsonFromSeedSections([
      { type: 'heading', level: 2, text: 'Titel' },
      { type: 'paragraph', text: 'Fließtext.' },
    ]);
    const doc = parseBlockDocumentFromDb(json);
    expect(doc?.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph']);
    expect((doc?.blocks[0]?.attrs as { level?: number })?.level).toBe(2);
  });
});
