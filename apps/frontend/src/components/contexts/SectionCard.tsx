import { Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { ContentCardWrapper, ViewMoreLink } from './cardShared';

export interface SectionCardProps {
  /** Card title (same style as ContextCard) */
  title: string;
  children: ReactNode;
  /** If set, show "View more" link at bottom right (einheitlich mit Company/Personal etc.) */
  viewMoreHref?: string;
}

/**
 * Section card – gleiche Component-Basis wie ContextCard (cardShared).
 * Used for dashboard blocks (Recent, Latest) and anywhere a consistent content card is needed.
 */
export function SectionCard({ title, children, viewMoreHref }: SectionCardProps) {
  return (
    <ContentCardWrapper>
      <Stack gap="xs">
        <Text fw={600} size="md">
          {title}
        </Text>
        {children}
        {viewMoreHref && <ViewMoreLink to={viewMoreHref} />}
      </Stack>
    </ContentCardWrapper>
  );
}
