import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NavLink, Text } from '@mantine/core';

export type AppShellScopeNavLinkProps = {
  to: string;
  label: string;
  active: boolean;
  leftSection: ReactNode;
  navLinkStyles: { root: Record<string, unknown> };
  /** Optional document count badge (shown only when defined and greater than 0). */
  badgeCount?: number;
};

/** Shared sidebar NavLink for Company / Department / Team scope entries. */
export function AppShellScopeNavLink({
  to,
  label,
  active,
  leftSection,
  navLinkStyles,
  badgeCount,
}: AppShellScopeNavLinkProps) {
  return (
    <NavLink
      data-sidebar-link
      component={Link}
      to={to}
      label={label}
      active={active}
      leftSection={leftSection}
      rightSection={
        badgeCount !== undefined && badgeCount > 0 ? (
          <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
            {badgeCount}
          </Text>
        ) : null
      }
      styles={navLinkStyles}
    />
  );
}
