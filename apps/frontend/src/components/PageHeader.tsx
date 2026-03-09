import { Title, Text, Group, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** Optional icon shown before the title (e.g. scope icon on Company/Department/Team pages). */
  titleIcon?: ReactNode;
  /** Title heading level (1 = h1, 2 = h2). Default 2. */
  titleOrder?: 1 | 2;
  description?: string;
  /** Optional metadata row (e.g. scope, parent, published, author) rendered under title. */
  metadata?: ReactNode;
  actions?: ReactNode;
  /** Optional breadcrumb row rendered above title. */
  breadcrumbs?: ReactNode;
  /** If true, no bottom margin (use when parent already provides spacing, e.g. DocumentPage). */
  noBottomMargin?: boolean;
}

export function PageHeader({
  title,
  titleIcon,
  titleOrder = 2,
  description,
  metadata,
  actions,
  breadcrumbs,
  noBottomMargin = false,
}: PageHeaderProps) {
  return (
    <Stack gap="lg" mb={noBottomMargin ? 0 : 'xl'}>
      {breadcrumbs != null && breadcrumbs}
      <Group justify="space-between" align="flex-start">
        {titleIcon != null ? (
          <Group gap="xs" wrap="nowrap">
            {titleIcon}
            <Title order={titleOrder}>{title}</Title>
          </Group>
        ) : (
          <Title order={titleOrder}>{title}</Title>
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
