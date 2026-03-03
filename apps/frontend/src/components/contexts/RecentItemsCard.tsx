import { Card, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { RecentItem } from '../../hooks/useRecentItems';

export interface RecentItemsCardProps {
  items: RecentItem[];
}

/**
 * Card "Recently viewed items" – same display on company, department and team page.
 */
export function RecentItemsCard({ items }: RecentItemsCardProps) {
  return (
    <Card withBorder padding="md">
      <Stack gap="xs">
        <Text fw={600} size="sm">
          Recently viewed items
        </Text>
        {items.length === 0 ? (
          <Text size="sm" c="dimmed">
            The list fills as you browse contexts and documents.
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
