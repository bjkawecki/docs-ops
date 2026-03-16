import { Card, Text } from '@mantine/core';
import { PageHeader } from '../components/PageHeader';

export function RepositoriesPage() {
  return (
    <>
      <PageHeader title="Repositories / Projects" description="Repositories – content to follow." />
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Content to follow.
        </Text>
      </Card>
    </>
  );
}
