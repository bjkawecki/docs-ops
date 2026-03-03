import { Card, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { RecentItem } from '../../hooks/useRecentItems';

export interface RecentItemsCardProps {
  items: RecentItem[];
}

/**
 * Karte „Zuletzt angesehene Inhalte“ – gleiche Darstellung auf Company-, Department- und Team-Seite.
 */
export function RecentItemsCard({ items }: RecentItemsCardProps) {
  return (
    <Card withBorder padding="md">
      <Stack gap="xs">
        <Text fw={600} size="sm">
          Zuletzt angesehene Inhalte
        </Text>
        {items.length === 0 ? (
          <Text size="sm" c="dimmed">
            Die Liste füllt sich beim Durchklicken von Kontexten und Dokumenten.
          </Text>
        ) : (
          <Stack gap={4}>
            {items.map((item) => {
              const href =
                item.type === 'document'
                  ? `/documents/${item.id}`
                  : item.type === 'process'
                    ? `/processes/${item.id}`
                    : `/projects/${item.id}`;
              return (
                <Link
                  key={`${item.type}-${item.id}`}
                  to={href}
                  style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                >
                  {item.name ?? item.id}
                </Link>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
