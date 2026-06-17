import type { ReactNode } from 'react';
import { AppShellSidebarNavLink } from './AppShellSidebarNavLink.js';

export type AppShellScopeNavLinkProps = {
  to: string;
  label: string;
  active: boolean;
  leftSection: ReactNode;
  navLinkStyles: { root: Record<string, unknown> };
  badgeCount?: number;
  isMiniRail?: boolean;
  onNavigate?: () => void;
};

/** Shared sidebar NavLink for Company / Department / Team scope entries. */
export function AppShellScopeNavLink({
  to,
  label,
  active,
  leftSection,
  navLinkStyles,
  badgeCount,
  isMiniRail = false,
  onNavigate,
}: AppShellScopeNavLinkProps) {
  return (
    <AppShellSidebarNavLink
      to={to}
      label={label}
      active={active}
      leftSection={leftSection}
      navLinkStyles={navLinkStyles}
      isMiniRail={isMiniRail}
      badgeCount={badgeCount}
      onNavigate={onNavigate}
    />
  );
}
