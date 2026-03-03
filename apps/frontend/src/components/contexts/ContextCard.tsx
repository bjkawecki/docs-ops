import { Badge, Card, Group, Menu, Stack, Text } from '@mantine/core';
import { ActionIcon } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconDotsVertical } from '@tabler/icons-react';

export interface ContextCardProps {
  /** Name des Kontexts */
  title: string;
  /** Prozess oder Projekt (für Badge) */
  type: 'process' | 'project';
  /** Link zur Detail-Seite */
  href: string;
  /** Optional: z. B. Dokumentenanzahl, letzte Aktivität */
  metadata?: ReactNode;
  /** Dreipunkt-Menü nur anzeigen wenn berechtigt */
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
  const typeLabel = type === 'process' ? 'Prozess' : 'Projekt';

  return (
    <Card withBorder padding="md" h="100%">
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
                aria-label="Kontext-Aktionen"
                onClick={(e) => e.preventDefault()}
              >
                <IconDotsVertical size={18} stroke={3} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {onEdit != null && <Menu.Item onClick={onEdit}>Bearbeiten</Menu.Item>}
              {onDelete != null && (
                <Menu.Item color="red" onClick={onDelete}>
                  Löschen
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </Card>
  );
}
