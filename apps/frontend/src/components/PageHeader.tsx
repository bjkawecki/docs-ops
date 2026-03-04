import { Title, Text, Group, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional metadata row (e.g. scope, parent, published, author) rendered under title. */
  metadata?: ReactNode;
  actions?: ReactNode;
  /** Optional breadcrumb row rendered above title. */
  breadcrumbs?: ReactNode;
}

export function PageHeader({
  title,
  description,
  metadata,
  actions,
  breadcrumbs,
}: PageHeaderProps) {
  return (
    <Stack gap="xs" mb="md">
      {breadcrumbs != null && breadcrumbs}
      <Group justify="space-between" align="flex-start">
        <Title order={2}>{title}</Title>
        {actions}
      </Group>
      {description != null && (
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      )}
      {metadata != null && (
        <Text size="sm" c="dimmed" component="div">
          {metadata}
        </Text>
      )}
    </Stack>
  );
}
