import type { QueryClient } from '@tanstack/react-query';
import type { NavigateFunction } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';

export type SubmitNewContextDocumentDraftInput = {
  contextId: string;
  title: string;
  tagIds: string[];
  queryClient: QueryClient;
  navigate: NavigateFunction;
  setLoading: (loading: boolean) => void;
  /** Nach Erfolg vor navigate (Modal schließen, Formular leeren). */
  onSuccessCleanup: () => void;
};

/**
 * POST /api/v1/documents – neuer Draft im Kontext; gleiche Logik für Prozess/Projekt/Subkontext-Seiten.
 */
export async function submitNewContextDocumentDraft({
  contextId,
  title,
  tagIds,
  queryClient,
  navigate,
  setLoading,
  onSuccessCleanup,
}: SubmitNewContextDocumentDraftInput): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) {
    notifications.show({
      title: 'Title required',
      message: 'Please enter a document title.',
      color: 'yellow',
    });
    return;
  }
  setLoading(true);
  try {
    const res = await apiFetch('/api/v1/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: trimmed,
        contextId,
        tagIds,
      }),
    });
    if (res.status === 201) {
      const doc = (await res.json()) as { id: string };
      void queryClient.invalidateQueries({ queryKey: ['contexts', contextId, 'documents'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
      onSuccessCleanup();
      notifications.show({
        title: 'Draft created',
        message: 'Redirecting to document.',
        color: 'green',
      });
      void navigate(`/documents/${doc.id}`);
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      notifications.show({
        title: 'Error',
        message: body?.error ?? res.statusText,
        color: 'red',
      });
    }
  } finally {
    setLoading(false);
  }
}
