import { Group, Stack, Text } from '@mantine/core';
import { IconBriefcase, IconFileText, IconRoute } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { RecentItem, RecentItemType } from '../../hooks/useRecentItems';
import { SectionCard } from './SectionCard';

/** Icon for a recent item by type (document / process / project). Used in RecentItemsCard and ScopeRecentColumn. */
export function RecentItemIcon({ type, size = 14 }: { type: RecentItemType; size?: number }) {
  switch (type) {
    case 'document':
      return <IconFileText size={size} style={{ flexShrink: 0 }} />;
    case 'process':
      return <IconRoute size={size} style={{ flexShrink: 0 }} />;
    case 'project':
      return <IconBriefcase size={size} style={{ flexShrink: 0 }} />;
  }
}

export interface RecentItemsCardProps {
  items: RecentItem[];
  /** Optional icon shown left of card title (e.g. dashboard). */
  titleIcon?: ReactNode;
  /** If set, show a "View more" link at the bottom right (e.g. dashboard → /catalog). */
  viewMoreHref?: string;
}

/**
 * Card "Recently viewed items" – same display on company, department and team page.
 * Uses SectionCard for consistent design with context cards.
 */
export function RecentItemsCard({ items, titleIcon, viewMoreHref }: RecentItemsCardProps) {
  return (
    <SectionCard title="Recently viewed" titleIcon={titleIcon} viewMoreHref={viewMoreHref}>
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
              <Group key={`${item.type}-${item.id}`} gap="xs" wrap="nowrap">
                <RecentItemIcon type={item.type} />
                <Link
                  to={href}
                  style={{ fontSize: 'var(--mantine-font-size-sm)', flex: 1, minWidth: 0 }}
                >
                  {item.name ?? item.id}
                </Link>
              </Group>
            );
          })}
        </Stack>
      )}
    </SectionCard>
  );
}
