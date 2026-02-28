import { Card } from '@mantine/core';
import { PageHeader } from '../components/PageHeader';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Settings – content to follow." />
      <Card withBorder padding="md">
        <span style={{ fontSize: 14, color: 'var(--mantine-color-dimmed)' }}>
          Content to follow.
        </span>
      </Card>
    </>
  );
}
