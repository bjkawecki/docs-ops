import { Card, Text } from '@mantine/core';
import { PageWithTabs } from '../components/PageWithTabs';

/**
 * Shared: contexts where at least one document was shared with the user (grants). Card grid. Placeholder.
 */
export function SharedPage() {
  return (
    <PageWithTabs title="Shared" description="Contexts with documents shared with you.">
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Shared contexts (by document grant) will be listed here. Backend endpoint (e.g. GET
          /api/v1/me/shared-contexts) can be added in a later phase.
        </Text>
      </Card>
    </PageWithTabs>
  );
}
