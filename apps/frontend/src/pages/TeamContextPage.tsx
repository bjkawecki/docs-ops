import { Card, Text } from '@mantine/core';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { PageWithTabs } from '../components/PageWithTabs';

/**
 * Team context view: card grid for processes/projects with this team as owner. Placeholder.
 */
export function TeamContextPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const {
    data: team,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      if (!teamId) throw new Error('Missing teamId');
      const res = await apiFetch(`/api/v1/teams/${teamId}`);
      if (!res.ok) throw new Error('Failed to load team');
      return res.json() as Promise<{ id: string; name: string }>;
    },
    enabled: !!teamId,
  });

  if (!teamId) return null;
  if (isPending)
    return (
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    );
  if (isError || !team)
    return (
      <Text size="sm" c="red">
        Team not found.
      </Text>
    );

  return (
    <PageWithTabs
      title={team.name}
      description="Team context – processes and projects. Card grid to follow."
    >
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Card grid for this team's contexts will be populated from API.
        </Text>
      </Card>
    </PageWithTabs>
  );
}
