import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Text } from '@mantine/core';
import { apiFetch } from '../api/client';

type SubcontextRedirectPayload = {
  id: string;
  project: { id: string };
};

/**
 * Legacy `/subcontexts/:subcontextId` → canonical `/projects/:projectId/subcontexts/:subcontextId`.
 */
export function SubcontextRedirectPage() {
  const { subcontextId } = useParams<{ subcontextId: string }>();

  const { data, isPending, isError } = useQuery({
    queryKey: ['subcontext', subcontextId, 'redirect'],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/subcontexts/${subcontextId}`);
      if (!res.ok) throw new Error('Not found');
      return res.json() as Promise<SubcontextRedirectPayload>;
    },
    enabled: !!subcontextId,
  });

  if (!subcontextId) return null;
  if (isPending)
    return (
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    );
  if (isError || !data?.project?.id)
    return (
      <Text size="sm" c="red">
        Subcontext not found.
      </Text>
    );

  return <Navigate to={`/projects/${data.project.id}/subcontexts/${subcontextId}`} replace />;
}
