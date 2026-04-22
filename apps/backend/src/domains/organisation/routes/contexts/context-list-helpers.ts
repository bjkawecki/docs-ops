import { canReadContext } from '../../permissions/contextPermissions.js';

/** Nested under `context`: last five non-deleted documents for list previews. */
export const contextDocumentsPreviewInclude = {
  documents: {
    where: { deletedAt: null },
    take: 5,
    orderBy: { updatedAt: 'desc' as const },
    select: { id: true, title: true },
  },
} as const;

export async function filterEntitiesWithContextIdByReadAccess<T extends { contextId: string }>(
  prisma: Parameters<typeof canReadContext>[0],
  userId: string,
  rows: T[]
): Promise<T[]> {
  const allowed = await Promise.all(
    rows.map(async (row) => ((await canReadContext(prisma, userId, row.contextId)) ? row : null))
  );
  return allowed.filter((row) => row !== null) as T[];
}
