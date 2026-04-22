import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { ContextOption, PdfExportJobStatusResponse } from './documentPageTypes';

export function useDocumentPageSecondaryQueries(args: {
  documentId: string | undefined;
  contextOwnerId: string | null;
  isTabVisible: boolean;
  assignContextOpened: boolean;
  pdfExportJobId: string | null;
}) {
  const { documentId, contextOwnerId, isTabVisible, assignContextOpened, pdfExportJobId } = args;

  const { data: tagsData } = useQuery({
    queryKey: ['tags', contextOwnerId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/tags?ownerId=${contextOwnerId}`);
      if (!res.ok) throw new Error('Failed to load tags');
      return res.json() as Promise<{ id: string; name: string }[]>;
    },
    enabled: !!contextOwnerId,
  });

  const { data: assignContextsData } = useQuery({
    queryKey: ['processes', 'projects', 'ownerUserId=me', 'for-assign'],
    queryFn: async () => {
      const [procRes, projRes] = await Promise.all([
        apiFetch('/api/v1/processes?limit=100&offset=0&ownerUserId=me'),
        apiFetch('/api/v1/projects?limit=100&offset=0&ownerUserId=me'),
      ]);
      const processes = procRes.ok
        ? ((await procRes.json()) as { items: { id: string; contextId: string; name: string }[] })
            .items
        : [];
      const projects = projRes.ok
        ? ((await projRes.json()) as { items: { id: string; contextId: string; name: string }[] })
            .items
        : [];
      const options: ContextOption[] = [
        ...processes.map((p) => ({
          id: p.id,
          contextId: p.contextId,
          name: p.name,
          kind: 'process' as const,
        })),
        ...projects.map((p) => ({
          id: p.id,
          contextId: p.contextId,
          name: p.name,
          kind: 'project' as const,
        })),
      ];
      return options;
    },
    enabled: assignContextOpened && !!documentId,
  });

  const { data: pdfExportStatus } = useQuery<PdfExportJobStatusResponse>({
    queryKey: ['document-export-pdf-status', documentId, pdfExportJobId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/export-pdf/${pdfExportJobId}`);
      if (!res.ok) throw new Error('Failed to load PDF export status');
      return res.json() as Promise<PdfExportJobStatusResponse>;
    },
    enabled: !!documentId && !!pdfExportJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'queued' || status === 'running') {
        return isTabVisible ? 5000 : 30_000;
      }
      return false;
    },
    refetchIntervalInBackground: true,
  });

  const tags = tagsData ?? [];
  const tagOptions = tags.map((t) => ({ value: t.id, label: t.name }));
  const assignContextOptions = (assignContextsData ?? []).map((c) => ({
    value: c.contextId,
    label: `${c.kind === 'process' ? 'Process' : 'Project'}: ${c.name}`,
  }));

  return {
    tags,
    tagOptions,
    assignContextOptions,
    pdfExportStatus,
  };
}
