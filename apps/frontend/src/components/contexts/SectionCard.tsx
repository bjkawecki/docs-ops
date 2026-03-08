import { Box, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { ContentCardWrapper, ViewMoreButton } from './cardShared';

export interface SectionCardProps {
  /** Card title (same style as ContextCard) */
  title: string;
  /** Optional icon shown left of title (e.g. dashboard card headers) */
  titleIcon?: ReactNode;
  children: ReactNode;
  /** If set, show "View more" link at bottom right (einheitlich mit Company/Personal etc.) */
  viewMoreHref?: string;
}

/**
 * Section card – gleiche Component-Basis wie ContextCard (cardShared).
 * Used for dashboard blocks (Recent, Latest) and anywhere a consistent content card is needed.
 * "View more" is pinned to bottom right when card has height.
 */
export function SectionCard({ title, titleIcon, children, viewMoreHref }: SectionCardProps) {
  return (
    <ContentCardWrapper>
      <Stack gap="xs" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
        <Box style={{ flex: 1, minHeight: 0 }}>
          <Stack gap="sm">
            <Group gap="xs" wrap="nowrap">
              {titleIcon}
              <Text fw={600} size="md">
                {title}
              </Text>
            </Group>
            {children}
          </Stack>
        </Box>
        {viewMoreHref && <ViewMoreButton to={viewMoreHref} />}
      </Stack>
    </ContentCardWrapper>
  );
}
