import type { PrismaClient } from '../../../generated/prisma/client.js';
import { resolveSearchIndexBodyText } from './searchIndexPlaintext.js';

async function upsertSearchIndexEntry(
  prisma: PrismaClient,
  documentId: string
): Promise<'upserted' | 'removed'> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      contextId: true,
      title: true,
      content: true,
      deletedAt: true,
      archivedAt: true,
      draftBlocks: true,
      currentPublishedVersion: { select: { blocks: true } },
    },
  });

  if (!doc || doc.deletedAt != null || doc.archivedAt != null) {
    await prisma.$executeRaw`
      DELETE FROM document_search_index
      WHERE document_id = ${documentId}
    `;
    return 'removed';
  }

  const indexBody = resolveSearchIndexBodyText({
    content: doc.content,
    draftBlocks: doc.draftBlocks,
    currentPublishedVersion: doc.currentPublishedVersion,
  });

  await prisma.$executeRaw`
    INSERT INTO document_search_index (document_id, context_id, title, content, searchable, updated_on)
    VALUES (
      ${doc.id},
      ${doc.contextId},
      ${doc.title},
      ${indexBody},
      to_tsvector('simple', concat_ws(' ', coalesce(${doc.title}, ''), coalesce(${indexBody}, ''))),
      NOW()
    )
    ON CONFLICT (document_id) DO UPDATE
    SET
      context_id = EXCLUDED.context_id,
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      searchable = EXCLUDED.searchable,
      updated_on = EXCLUDED.updated_on
  `;

  return 'upserted';
}

export async function runIncrementalReindex(
  prisma: PrismaClient,
  args: { documentId?: string; contextId?: string; trigger: string }
): Promise<{ indexedCount: number; removedCount: number }> {
  if (args.documentId) {
    const action = await upsertSearchIndexEntry(prisma, args.documentId);
    return action === 'upserted'
      ? { indexedCount: 1, removedCount: 0 }
      : { indexedCount: 0, removedCount: 1 };
  }

  if (args.contextId) {
    await prisma.$executeRaw`
      DELETE FROM document_search_index
      WHERE context_id = ${args.contextId}
    `;
    const docs = await prisma.document.findMany({
      where: { contextId: args.contextId, deletedAt: null, archivedAt: null },
      select: { id: true },
    });
    for (const { id } of docs) {
      await upsertSearchIndexEntry(prisma, id);
    }
    return { indexedCount: docs.length, removedCount: 0 };
  }

  const count = await prisma.document.count({
    where: { deletedAt: null, archivedAt: null },
  });
  return { indexedCount: count, removedCount: 0 };
}

export async function runFullReindex(prisma: PrismaClient): Promise<{ indexedCount: number }> {
  await prisma.$executeRaw`TRUNCATE TABLE document_search_index`;
  const docs = await prisma.document.findMany({
    where: { deletedAt: null, archivedAt: null },
    select: { id: true },
  });
  for (const { id } of docs) {
    await upsertSearchIndexEntry(prisma, id);
  }
  return { indexedCount: docs.length };
}
