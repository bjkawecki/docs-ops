import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, NavLink, Text, Tooltip } from '@mantine/core';

export type AppShellSidebarNavLinkProps = {
  to: string;
  label: string;
  active: boolean;
  leftSection: ReactNode;
  navLinkStyles: { root: Record<string, unknown> };
  isMiniRail: boolean;
  badgeCount?: number;
  ariaLabel?: string;
  title?: string;
  onNavigate?: () => void;
};

function wrapIconWithBadge(section: ReactNode, showBadge: boolean): ReactNode {
  if (!showBadge) return section;
  return (
    <Box className="app-shell-sidebar-icon-wrap" component="span">
      {section}
      <span className="app-shell-sidebar-badge-dot" aria-hidden="true" />
    </Box>
  );
}

function badgeRightSection(count: number | undefined, isMiniRail: boolean) {
  if (isMiniRail || count === undefined || count <= 0) return null;
  return (
    <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
      {count > 99 ? '99+' : count}
    </Text>
  );
}

function tooltipLabel(label: string, badgeCount?: number): string {
  if (badgeCount !== undefined && badgeCount > 0) {
    return `${label} (${badgeCount})`;
  }
  return label;
}

export function AppShellSidebarNavLink({
  to,
  label,
  active,
  leftSection,
  navLinkStyles,
  isMiniRail,
  badgeCount,
  ariaLabel,
  title,
  onNavigate,
}: AppShellSidebarNavLinkProps) {
  const hasBadge = badgeCount !== undefined && badgeCount > 0;
  const link = (
    <NavLink
      data-sidebar-link
      component={Link}
      to={to}
      label={isMiniRail ? '' : label}
      title={isMiniRail ? undefined : title}
      aria-label={ariaLabel ?? (isMiniRail ? tooltipLabel(label, badgeCount) : undefined)}
      active={active}
      leftSection={isMiniRail ? wrapIconWithBadge(leftSection, hasBadge) : leftSection}
      rightSection={badgeRightSection(badgeCount, isMiniRail)}
      styles={navLinkStyles}
      onClick={onNavigate}
    />
  );

  if (isMiniRail) {
    return (
      <Tooltip label={tooltipLabel(label, badgeCount)} position="right" withArrow>
        <Box className="app-shell-sidebar-nav-link--mini">{link}</Box>
      </Tooltip>
    );
  }

  return link;
}
