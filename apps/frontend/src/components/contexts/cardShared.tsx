import { Box, Button, Card, Group, Stack, Text } from '@mantine/core';
import { useMantineTheme } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ContentLink } from '../ContentLink';

/** One "View more" control: always the same Link-Button. Dashboard: real link (to). Scope tabs: to="#" + onClick with preventDefault. Same look and hover everywhere. */
export function ViewMoreButton({ to, onClick }: { to?: string; onClick?: () => void }) {
  const { primaryColor } = useMantineTheme();
  const href = to ?? '#';
  const handleClick = onClick
    ? (e: React.MouseEvent) => {
        e.preventDefault();
        onClick();
      }
    : undefined;
  return (
    <Group justify="flex-end" mt="xs">
      <Button
        color={primaryColor}
        component={Link}
        to={href}
        variant="subtle"
        size="xs"
        onClick={handleClick}
      >
        View more
      </Button>
    </Group>
  );
}

export interface BaseCardProps {
  /** Title (can be plain text or a Link). */
  title: ReactNode;
  /** Optional icon left of title. */
  titleIcon?: ReactNode;
  /** Main content (document list, custom content). */
  children: ReactNode;
  /** View more: either link (to) or action (onClick). Rendered bottom right. Omit to hide footer. */
  viewMore?: { to?: string; onClick?: () => void };
  /** Optional slot for header actions (e.g. three-dot menu). */
  actions?: ReactNode;
  className?: string;
}

/** Shared base for ScopeCard and others: same layout, View more always bottom right when viewMore is set. */
export function BaseCard({
  title,
  titleIcon,
  children,
  viewMore,
  actions,
  className,
}: BaseCardProps) {
  return (
    <Card {...contentCardProps} className={className}>
      <Stack gap="xs" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            {titleIcon}
            {typeof title === 'string' ? (
              <Text fw={600} size="md" truncate>
                {title}
              </Text>
            ) : (
              title
            )}
          </Group>
          {actions}
        </Group>
        <Box style={{ flex: 1, minHeight: 0 }}>{children}</Box>
        {viewMore != null && (
          <Box
            style={{
              marginTop: 'auto',
              width: '100%',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <ViewMoreButton to={viewMore.to} onClick={viewMore.onClick} />
          </Box>
        )}
      </Stack>
    </Card>
  );
}

/** View more config: link (to) or action (onClick). */
export interface ScopeCardViewMore {
  to?: string;
  onClick?: () => void;
}

export interface ScopeCardProps {
  /** Card title (always plain text, not a link). */
  title: string;
  titleIcon?: ReactNode;
  /** View more: link and/or click handler. For context list mode with href, can be omitted and will be set to { to: href }. */
  viewMore?: ScopeCardViewMore;
  /**
   * Overview mode: pass children (e.g. list of links). Body = children.
   * Context mode: omit children and pass href + documents/subcontexts/metadata; body is built internally.
   */
  children?: ReactNode;
  /** Context mode: link to detail page. Used for viewMore.to when documents or subcontexts are provided. */
  href?: string;
  /** Context mode: document list (overview-style card). */
  documents?: { id: string; title: string }[];
  /** Context mode: subcontexts line (e.g. "Subcontexts: A, B"). */
  subcontexts?: { id: string; name: string }[];
  /** Context mode: custom body when no documents/subcontexts (e.g. metadata). */
  metadata?: ReactNode;
}

/** Unified card for scope Overview tab (children + viewMore.onClick) and Processes/Projects tabs (href + documents/subcontexts). Title is always plain text. Link styling via CSS only. */
export function ScopeCard({
  title,
  titleIcon,
  viewMore: viewMoreProp,
  children,
  href,
  documents,
  subcontexts,
  metadata,
}: ScopeCardProps) {
  const isContextListMode =
    children === undefined && (documents !== undefined || subcontexts !== undefined);
  const isContextMetadataMode =
    children === undefined && !isContextListMode && (href !== undefined || metadata !== undefined);

  const viewMore = viewMoreProp ?? (isContextListMode && href ? { to: href } : undefined);

  const body =
    children !== undefined ? (
      children
    ) : isContextListMode ? (
      <>
        {documents && documents.length > 0 && (
          <Stack gap={4} align="flex-start">
            {documents.map((doc) => (
              <ContentLink
                key={doc.id}
                to={`/documents/${doc.id}`}
                style={{ fontSize: 'var(--mantine-font-size-sm)' }}
              >
                {doc.title || doc.id}
              </ContentLink>
            ))}
          </Stack>
        )}
        {subcontexts && subcontexts.length > 0 && (
          <Text size="xs" c="dimmed">
            Subcontexts: {subcontexts.map((s) => s.name).join(', ')}
          </Text>
        )}
      </>
    ) : isContextMetadataMode ? (
      <>{metadata}</>
    ) : null;

  return (
    <BaseCard title={title} titleIcon={titleIcon} viewMore={viewMore ?? undefined}>
      {body ?? null}
    </BaseCard>
  );
}

/** Gemeinsame Card-Props für ContextCard und SectionCard (einheitliches Design). */
export const contentCardProps = {
  withBorder: true as const,
  padding: 'md' as const,
  h: '100%' as const,
};

/** View more as link (e.g. dashboard cards). Same component as ViewMoreButton with to. */
export function ViewMoreLink({ to }: { to: string }) {
  return <ViewMoreButton to={to} />;
}

/** Wrapper: Card mit einheitlichem Design für alle Kontext-/Sektions-Karten. */
export function ContentCardWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card {...contentCardProps} className={className}>
      {children}
    </Card>
  );
}
