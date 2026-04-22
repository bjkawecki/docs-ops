/**
 * Backfill: `DocumentVersion.blocks` / `Document.draftBlocks` aus Markdown-`content` (EPIC-3).
 * Idempotent: nur Zeilen mit `blocks` bzw. `draftBlocks` IS NULL.
 *
 * Usage (from apps/backend):
 *   pnpm exec tsx scripts/run-backfill-document-blocks.ts
 *   pnpm exec tsx scripts/run-backfill-document-blocks.ts --documentId=<cuid>
 */
import './load-env.js';
import { prisma } from '../src/db.js';
import { backfillAllDocumentBlocks } from '../src/domains/documents/services/blocks/documentBlocksBackfill.js';

function parseArgs(): { documentId?: string } {
  const documentIdArg = process.argv.find((a) => a.startsWith('--documentId='));
  if (documentIdArg) {
    return { documentId: documentIdArg.split('=')[1]?.trim() };
  }
  return {};
}

async function main() {
  const { documentId } = parseArgs();
  const batch = 300;
  let totalV = 0;
  let totalD = 0;
  for (;;) {
    const r = await backfillAllDocumentBlocks(prisma, { documentId, limit: batch });
    totalV += r.documentVersionsUpdated;
    totalD += r.documentsDraftUpdated;
    if (r.documentVersionsUpdated + r.documentsDraftUpdated === 0) break;
    console.log(
      `Batch: +${r.documentVersionsUpdated} version(s), +${r.documentsDraftUpdated} document draft(s)`
    );
  }
  console.log(`Done. DocumentVersion rows: ${totalV}, Document draft rows: ${totalD}.`);
}

void main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
