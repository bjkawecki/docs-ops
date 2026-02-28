import { Title, Text, Group, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Stack gap="xs" mb="md">
      <Group justify="space-between" align="flex-start">
        <Title order={2}>{title}</Title>
        {actions}
      </Group>
      {description != null && (
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      )}
    </Stack>
  );
}
