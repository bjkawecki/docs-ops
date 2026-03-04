import { Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { RecentItem } from '../../hooks/useRecentItems';
import { SectionCard } from './SectionCard';

export interface RecentItemsCardProps {
  items: RecentItem[];
  /** If set, show a "View more" link at the bottom right (e.g. dashboard → /catalog). */
  viewMoreHref?: string;
}

/**
 * Card "Recently viewed items" – same display on company, department and team page.
 * Uses SectionCard for consistent design with context cards.
 */
export function RecentItemsCard({ items, viewMoreHref }: RecentItemsCardProps) {
  return (
    <SectionCard title="Recently viewed" viewMoreHref={viewMoreHref}>
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
    </SectionCard>
  );
}
