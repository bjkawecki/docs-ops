import { Card } from '@mantine/core';
import { PageWithTabs } from '../components/PageWithTabs';

export function FirmaPage() {
  return (
    <PageWithTabs title="Company" description="Company – content to follow.">
      <Card withBorder padding="md">
        <span style={{ fontSize: 14, color: 'var(--mantine-color-dimmed)' }}>
          Content to follow.
        </span>
      </Card>
    </PageWithTabs>
  );
}
