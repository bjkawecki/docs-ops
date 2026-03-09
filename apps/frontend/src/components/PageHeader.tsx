import { Title, Text, Group, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** Optional icon shown before the title (e.g. scope icon on Company/Department/Team pages). */
  titleIcon?: ReactNode;
  description?: string;
  /** Optional metadata row (e.g. scope, parent, published, author) rendered under title. */
  metadata?: ReactNode;
  actions?: ReactNode;
  /** Optional breadcrumb row rendered above title. */
  breadcrumbs?: ReactNode;
}

export function PageHeader({
  title,
  titleIcon,
  description,
  metadata,
  actions,
  breadcrumbs,
}: PageHeaderProps) {
  return (
    <Stack gap="md" mb="xl">
      {breadcrumbs != null && breadcrumbs}
      <Group justify="space-between" align="flex-start">
        {titleIcon != null ? (
          <Group gap="xs" wrap="nowrap">
            {titleIcon}
            <Title order={2}>{title}</Title>
          </Group>
        ) : (
          <Title order={2}>{title}</Title>
        )}
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
