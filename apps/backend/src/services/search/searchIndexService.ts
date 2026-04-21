import type { PrismaClient } from '../../../generated/prisma/client.js';

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
    },
  });

  if (!doc || doc.deletedAt != null || doc.archivedAt != null) {
    await prisma.$executeRaw`
      DELETE FROM document_search_index
      WHERE document_id = ${documentId}
    `;
    return 'removed';
  }

  await prisma.$executeRaw`
    INSERT INTO document_search_index (document_id, context_id, title, content, searchable, updated_on)
    VALUES (
      ${doc.id},
      ${doc.contextId},
      ${doc.title},
      ${doc.content},
      to_tsvector('simple', concat_ws(' ', coalesce(${doc.title}, ''), coalesce(${doc.content}, ''))),
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
    await prisma.$executeRaw`
      INSERT INTO document_search_index (document_id, context_id, title, content, searchable, updated_on)
      SELECT
        d.id,
        d."contextId",
        d.title,
        d.content,
        to_tsvector('simple', concat_ws(' ', coalesce(d.title, ''), coalesce(d.content, ''))),
        NOW()
      FROM "Document" d
      WHERE d."contextId" = ${args.contextId}
        AND d."deletedAt" IS NULL
        AND d."archivedAt" IS NULL
      ON CONFLICT (document_id) DO UPDATE
      SET
        context_id = EXCLUDED.context_id,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        searchable = EXCLUDED.searchable,
        updated_on = EXCLUDED.updated_on
    `;
    const count = await prisma.document.count({
      where: { contextId: args.contextId, deletedAt: null, archivedAt: null },
    });
    return { indexedCount: count, removedCount: 0 };
  }

  const count = await prisma.document.count({
    where: { deletedAt: null, archivedAt: null },
  });
  return { indexedCount: count, removedCount: 0 };
}

export async function runFullReindex(prisma: PrismaClient): Promise<{ indexedCount: number }> {
  await prisma.$executeRaw`TRUNCATE TABLE document_search_index`;
  await prisma.$executeRaw`
    INSERT INTO document_search_index (document_id, context_id, title, content, searchable, updated_on)
    SELECT
      d.id,
      d."contextId",
      d.title,
      d.content,
      to_tsvector('simple', concat_ws(' ', coalesce(d.title, ''), coalesce(d.content, ''))),
      NOW()
    FROM "Document" d
    WHERE d."deletedAt" IS NULL
      AND d."archivedAt" IS NULL
  `;
  const indexedCount = await prisma.document.count({
    where: { deletedAt: null, archivedAt: null },
  });
  return { indexedCount };
}
