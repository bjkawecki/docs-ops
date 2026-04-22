import { Card, Text } from '@mantine/core';
import { PageHeader } from '../../components/ui/PageHeader';

export function ProzessePage() {
  return (
    <>
      <PageHeader title="Processes / SOPs" description="Processes – content to follow." />
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Content to follow.
        </Text>
      </Card>
    </>
  );
}
