import './ScopeRecentColumn.css';
import { ActionIcon, Box, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { useMantineTheme } from '@mantine/core';
import {
  IconClock,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
} from '@tabler/icons-react';
import { ContentLink } from './ContentLink';
import { RecentItemIcon } from './contexts/RecentItemsCard';
import type { RecentScope } from '../hooks/useRecentItems';
import { useRecentItems } from '../hooks/useRecentItems';

const TOGGLE_STRIP_WIDTH = 32;
const WIDTH_OPEN = 300;
const WIDTH_CLOSED = 48;

export interface ScopeRecentColumnProps {
  /** Whether the column is expanded (visible). Default true when undefined. */
  open: boolean;
  onToggle: () => void;
  scope: RecentScope | null;
  /** Kept for API compatibility; not used (no "View more" in sidebar). */
  viewMoreHref?: string;
}

/**
 * Persistent right column for "Recently viewed" on scope pages.
 * Collapsible; state is persisted via preferences (scopeRecentPanelOpen).
 * Plain list (no card), full height, body background.
 */
export function ScopeRecentColumn({ open, onToggle, scope }: ScopeRecentColumnProps) {
  const { primaryColor } = useMantineTheme();
  const { items } = useRecentItems(scope);

  if (scope === null) return null;

  const contentWidth = open ? WIDTH_OPEN : WIDTH_CLOSED;

  return (
    <Box
      style={{
        width: TOGGLE_STRIP_WIDTH + contentWidth,
        minWidth: TOGGLE_STRIP_WIDTH + contentWidth,
        flexShrink: 0,
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'row',
        transition: 'width 0.2s ease, min-width 0.2s ease',
      }}
    >
      {/* Toggle strip: left of the sidebar */}
      <Box
        style={{
          width: TOGGLE_STRIP_WIDTH,
          minWidth: TOGGLE_STRIP_WIDTH,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 'var(--mantine-spacing-sm)',
          background: 'var(--mantine-color-body)',
        }}
      >
        <ActionIcon
          variant="subtle"
          size="md"
          onClick={onToggle}
          /* Optional: Das color Prop auf dem ActionIcon sorgt noch für den richtigen Hover-Hintergrund */
          color={primaryColor}
        >
          {open ? (
            <IconLayoutSidebarRightCollapse
              size={16}
              /* Zwingt das SVG, die Mantine CSS Variable für die Primärfarbe zu nutzen */
              color={`var(--mantine-color-${primaryColor}-filled)`}
            />
          ) : (
            <IconLayoutSidebarRightExpand
              size={16}
              color={`var(--mantine-color-${primaryColor}-filled)`}
            />
          )}
        </ActionIcon>
      </Box>
      {/* Sidebar content: right of the toggle */}
      <Box
        style={{
          width: contentWidth,
          minWidth: contentWidth,
          flexShrink: 0,
          alignSelf: 'stretch',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--mantine-color-default-border)',
          background: 'var(--mantine-color-body)',
          transition: 'width 0.2s ease, min-width 0.2s ease',
          overflow: 'hidden',
        }}
      >
        {open ? (
          <>
            <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <ScrollArea style={{ flex: 1 }} type="auto" scrollbarSize="xs">
                <Box
                  p="md"
                  role="list"
                  aria-labelledby="recently-viewed-heading"
                  data-recent-viewed-list
                >
                  <Group gap="xs" mb="xs" wrap="nowrap">
                    <IconClock
                      size={18}
                      style={{ color: 'var(--mantine-color-dimmed)' }}
                      aria-hidden
                    />
                    <Text id="recently-viewed-heading" size="sm" fw={500}>
                      Recently viewed
                    </Text>
                  </Group>
                  <Box style={{ paddingLeft: 28 }}>
                    {items.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        The list fills as you browse contexts and documents.
                      </Text>
                    ) : (
                      <Stack gap={4} align="flex-start">
                        {items.map((item) => {
                          const href =
                            item.type === 'document'
                              ? `/documents/${item.id}`
                              : item.type === 'process'
                                ? `/processes/${item.id}`
                                : `/projects/${item.id}`;
                          return (
                            <Group key={`${item.type}-${item.id}`} gap="xs" wrap="nowrap">
                              <RecentItemIcon type={item.type} size={14} />
                              <ContentLink
                                to={href}
                                style={{
                                  fontSize: 'var(--mantine-font-size-sm)',
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                {item.name ?? item.id}
                              </ContentLink>
                            </Group>
                          );
                        })}
                      </Stack>
                    )}
                  </Box>
                </Box>
              </ScrollArea>
            </Box>
          </>
        ) : (
          <Box
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingTop: 'var(--mantine-spacing-md)',
            }}
          >
            <IconClock size={20} style={{ color: 'var(--mantine-color-dimmed)' }} aria-hidden />
          </Box>
        )}
      </Box>
    </Box>
  );
}
