import { Card, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageHeader';

type UserSpaceRes = { id: string; name: string; contextId: string; context?: { id: string } };
type DocItem = { id: string; title: string; contextId: string };

export function UserSpaceDetailPage() {
  const { userSpaceId } = useParams<{ userSpaceId: string }>();

  const {
    data: space,
    isPending: spacePending,
    isError: spaceError,
  } = useQuery({
    queryKey: ['user-space', userSpaceId],
    queryFn: async (): Promise<UserSpaceRes> => {
      if (!userSpaceId) throw new Error('Missing userSpaceId');
      const res = await apiFetch(`/api/v1/user-spaces/${userSpaceId}`);
      if (!res.ok) throw new Error('Failed to load space');
      return (await res.json()) as UserSpaceRes;
    },
    enabled: !!userSpaceId,
  });

  const contextId = space?.contextId ?? space?.context?.id;

  const { data: docsRes, isPending: docsPending } = useQuery({
    queryKey: ['contexts', contextId, 'documents'],
    queryFn: async () => {
      if (!contextId) throw new Error('Missing contextId');
      const res = await apiFetch(`/api/v1/contexts/${contextId}/documents?limit=100&offset=0`);
      if (!res.ok) throw new Error('Failed to load documents');
      return (await res.json()) as { items: DocItem[] };
    },
    enabled: !!contextId,
  });

  const documents = docsRes?.items ?? [];

  if (!userSpaceId) return null;
  if (spacePending)
    return (
      <Stack gap="md">
        <PageHeader title="Personal space" />
        <Text size="sm" c="dimmed">
          Loading…
        </Text>
      </Stack>
    );
  if (spaceError || !space)
    return (
      <Stack gap="md">
        <PageHeader title="Personal space" />
        <Text size="sm" c="red">
          Space not found.
        </Text>
      </Stack>
    );

  return (
    <>
      <PageHeader title={space.name} description="Documents in this personal space." />
      <Stack gap="md" pt="md">
        {docsPending ? (
          <Text size="sm" c="dimmed">
            Loading documents…
          </Text>
        ) : documents.length === 0 ? (
          <Card withBorder padding="md">
            <Text size="sm" c="dimmed">
              No documents in this space yet.
            </Text>
          </Card>
        ) : (
          <Stack gap="xs">
            {documents.map((d) => (
              <Card key={d.id} withBorder padding="sm" component={Link} to={`/documents/${d.id}`}>
                <Text fw={500} size="sm">
                  {d.title || d.id}
                </Text>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </>
  );
}
