import type { QueryClient } from '@tanstack/react-query';
import { meQueryKey } from '../../hooks/useMe';

/** Nach Save / Publish / Trash: Dokument, Katalog, Kontextlisten. */
export function invalidateDocumentIndexCaches(
  queryClient: QueryClient,
  documentId: string,
  contextId: string | null | undefined
): void {
  void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
  void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
  void queryClient.invalidateQueries({ queryKey: ['contexts'] });
  if (contextId) {
    void queryClient.invalidateQueries({
      queryKey: ['contexts', contextId, 'documents'],
    });
  }
}

/** Nach Archivieren / Entarchivieren (gleiche Keys wie zuvor dupliziert). */
export function invalidateDocumentArchivedTransitionCaches(
  queryClient: QueryClient,
  documentId: string,
  contextId: string | null | undefined
): void {
  void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
  void queryClient.invalidateQueries({ queryKey: ['me', 'archive'] });
  void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
  if (contextId) {
    void queryClient.invalidateQueries({
      queryKey: ['contexts', contextId, 'documents'],
    });
  }
}

export function invalidateMeDraftsAndPersonalDocuments(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
  void queryClient.invalidateQueries({ queryKey: [...meQueryKey, 'personal-documents'] });
}
