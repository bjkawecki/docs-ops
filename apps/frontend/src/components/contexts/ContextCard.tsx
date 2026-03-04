import { Badge, Group, Menu, Stack, Text } from '@mantine/core';
import { ActionIcon } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconDotsVertical } from '@tabler/icons-react';
import { ContentCardWrapper } from './cardShared';

export interface ContextCardProps {
  /** Context name */
  title: string;
  /** Process or project (for badge) */
  type: 'process' | 'project';
  /** Link zur Detail-Seite */
  href: string;
  /** Optional: e.g. document count, last activity */
  metadata?: ReactNode;
  /** Only show three-dot menu when permitted */
  canManage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ContextCard({
  title,
  type,
  href,
  metadata,
  canManage,
  onEdit,
  onDelete,
}: ContextCardProps) {
  const typeLabel = type === 'process' ? 'Process' : 'Project';

  return (
    <ContentCardWrapper>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Link
          to={href}
          style={{
            flex: 1,
            minWidth: 0,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <Stack gap="xs">
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} size="md" truncate>
                {title}
              </Text>
              <Badge size="sm" variant="light">
                {typeLabel}
              </Badge>
            </Group>
            {metadata != null && <>{metadata}</>}
          </Stack>
        </Link>
        {canManage && (
          <Menu shadow="md" position="bottom-end">
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                size="md"
                aria-label="Context actions"
                onClick={(e) => e.preventDefault()}
              >
                <IconDotsVertical size={18} stroke={3} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {onEdit != null && <Menu.Item onClick={onEdit}>Edit</Menu.Item>}
              {onDelete != null && (
                <Menu.Item color="red" onClick={onDelete}>
                  Delete
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </ContentCardWrapper>
  );
}
