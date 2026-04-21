import type { PrismaClient } from '../../../generated/prisma/client.js';
import {
  getReadableCatalogScope,
  getWritableCatalogScope,
} from '../../permissions/catalogPermissions.js';
import { executeFtsDocumentSearch } from './documentSearchFts.js';
import type { SearchDocumentsArgs, SearchDocumentItem } from './documentSearchTypes.js';

export type { SearchDocumentsArgs, SearchDocumentItem };
export { searchDocumentsByContainsFallback } from './documentSearchContains.js';

export async function searchDocumentsForUser(
  prisma: PrismaClient,
  userId: string,
  args: SearchDocumentsArgs
): Promise<{ items: SearchDocumentItem[]; total: number; limit: number; offset: number }> {
  const [readable, writable] = await Promise.all([
    getReadableCatalogScope(prisma, userId),
    getWritableCatalogScope(prisma, userId),
  ]);
  return executeFtsDocumentSearch(prisma, args, readable, writable);
}
