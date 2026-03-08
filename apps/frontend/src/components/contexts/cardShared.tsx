import { Box, Button, Card, Group, Stack, Text } from '@mantine/core';
import { useMantineTheme } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

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

/** Card for scope overview (Processes, Projects, Documents): icon, prominent title, spacing, View more button. */
export function OverviewCard({
  title,
  titleIcon,
  children,
  onViewMore,
}: {
  title: string;
  titleIcon?: ReactNode;
  children: ReactNode;
  onViewMore: () => void;
}) {
  return (
    <Card {...contentCardProps}>
      <Stack gap="xs" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
        <Box style={{ flex: 1, minHeight: 0 }}>
          <Stack gap="md">
            <Group gap="xs" wrap="nowrap">
              {titleIcon}
              <Text fw={600} size="md">
                {title}
              </Text>
            </Group>
            {children}
          </Stack>
        </Box>
        <ViewMoreButton onClick={onViewMore} />
      </Stack>
    </Card>
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
export function ContentCardWrapper({ children }: { children: React.ReactNode }) {
  return <Card {...contentCardProps}>{children}</Card>;
}
