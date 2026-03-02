import { Card, Text } from '@mantine/core';
import { PageWithTabs } from '../components/PageWithTabs';

/**
 * Department contexts: card grid, one card per context. Placeholder.
 */
export function DepartmentPage() {
  return (
    <PageWithTabs title="Department" description="Department-level contexts. Card grid to follow.">
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Department card grid (processes/projects with department owner) will be populated from
          API.
        </Text>
      </Card>
    </PageWithTabs>
  );
}
