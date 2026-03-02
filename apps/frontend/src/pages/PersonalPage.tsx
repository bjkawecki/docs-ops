import { Button, Card, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { MeResponse } from '../api/me-types';
import { PageWithTabs } from '../components/PageWithTabs';

/**
 * Personal: user's UserSpace(s). Card grid; one space per user. Empty state: CTA "Create your personal space".
 */
export function PersonalPage() {
  const { data: me } = useQuery<MeResponse>({ queryKey: ['me'] });
  const userSpaces = me?.identity?.userSpaces ?? [];
  const hasSpaces = userSpaces.length > 0;

  return (
    <PageWithTabs title="Personal" description="Your personal documentation space.">
      {hasSpaces ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Card grid for your personal space(s) will show here. UserSpaces from /api/v1/me:{' '}
            {userSpaces.length} found.
          </Text>
        </Card>
      ) : (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed" mb="sm">
            You don't have a personal space yet.
          </Text>
          <Button variant="light" size="sm" disabled>
            Create your personal space
          </Button>
        </Card>
      )}
    </PageWithTabs>
  );
}
