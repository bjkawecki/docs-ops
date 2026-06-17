import { Link } from 'react-router-dom';
import { AppShell as MantineAppShell, Stack, Box, Text, Divider } from '@mantine/core';
import {
  IconLayoutDashboard,
  IconListSearch,
  IconUser,
  IconShare,
  IconClipboardCheck,
  IconBell,
} from '@tabler/icons-react';
import { DocopsLogo } from './DocopsLogo';
import { AppShellAccountMenu } from './AppShellAccountMenu.js';
import { AppShellRoleBasedNav } from './AppShellRoleBasedNav.js';
import { AppShellSidebarNavLink } from './AppShellSidebarNavLink.js';
import { AppShellSidebarCollapseToggle } from './AppShellSidebarCollapseToggle.js';
import { isActive } from './appShellNavUtils.js';
import { MAIN_NAV_ID, SIDEBAR_MINI_GAP } from './appShellLayoutConstants.js';
import type { useAppShellSidebarData } from './useAppShellSidebarData.js';

type SidebarData = ReturnType<typeof useAppShellSidebarData>;

type Props = {
  s: SidebarData;
  isMiniRail: boolean;
  showDesktopToggle: boolean;
  onToggleDesktop: () => void;
  onNavigate: () => void;
};

export function AppShellNavbar({
  s,
  isMiniRail,
  showDesktopToggle,
  onToggleDesktop,
  onNavigate,
}: Props) {
  return (
    <MantineAppShell.Navbar
      id={MAIN_NAV_ID}
      aria-label="Main navigation"
      p={isMiniRail ? 'xs' : 'md'}
      className="app-shell-navbar"
    >
      <Stack justify="space-between" style={{ height: '100%' }}>
        <Box data-sidebar-nav>
          <MantineAppShell.Section>
            <Link
              to="/"
              onClick={onNavigate}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: isMiniRail ? 'center' : 'flex-start',
                gap: 8,
                textDecoration: 'none',
                color: 'inherit',
              }}
              aria-label="DocsOps home"
            >
              <DocopsLogo width={isMiniRail ? 36 : 40} height={isMiniRail ? 36 : 40} />
              {!isMiniRail ? (
                <Text component="span">
                  <Text
                    component="span"
                    c={s.resolvedColorScheme === 'dark' ? 'white' : 'dimmed'}
                    style={{ fontWeight: 500, fontSize: '1.5rem', letterSpacing: '-0.05em' }}
                  >
                    Docs
                  </Text>
                  <Text
                    component="span"
                    c="var(--mantine-primary-color-filled)"
                    style={{ fontWeight: 500, fontSize: '1.5rem', letterSpacing: '-0.05em' }}
                  >
                    Ops
                  </Text>
                </Text>
              ) : null}
            </Link>
            <Divider my="sm" />
          </MantineAppShell.Section>
          <MantineAppShell.Section mt={isMiniRail ? 'sm' : 'xl'}>
            <Stack
              gap={isMiniRail ? SIDEBAR_MINI_GAP : 4}
              className={isMiniRail ? 'app-shell-mini-nav-stack' : undefined}
            >
              <AppShellSidebarNavLink
                to="/"
                label="Dashboard"
                active={isActive('/', s.location.pathname)}
                leftSection={<IconLayoutDashboard size={18} />}
                navLinkStyles={s.navLinkStyles}
                isMiniRail={isMiniRail}
                onNavigate={onNavigate}
              />
              <AppShellSidebarNavLink
                to="/catalog"
                label="Catalog"
                active={isActive('/catalog', s.location.pathname)}
                leftSection={<IconListSearch size={18} />}
                navLinkStyles={s.navLinkStyles}
                isMiniRail={isMiniRail}
                badgeCount={s.catalogCount}
                onNavigate={onNavigate}
              />
              {!isMiniRail ? (
                <Text size="xs" fw={500} c="dimmed" mt="xs" mb={4}>
                  Organization
                </Text>
              ) : null}
              <AppShellRoleBasedNav
                pathname={s.location.pathname}
                navLinkStyles={s.navLinkStyles}
                me={s.me}
                isAdmin={s.isAdmin}
                isCompanyLead={s.isCompanyLead}
                isDepartmentLead={s.isDepartmentLead}
                departmentId={s.departmentId}
                userTeamId={s.userTeamId}
                userDepartmentId={s.userDepartmentId}
                companyDepartments={s.companyDepartments}
                departmentTeams={s.departmentTeams}
                companyCount={s.companyCount}
                departmentCounts={s.departmentCounts}
                teamCounts={s.teamCounts}
                departmentsSectionExpanded={s.departmentsSectionExpanded}
                setDepartmentsSectionExpanded={s.setDepartmentsSectionExpanded}
                teamsSectionExpanded={s.teamsSectionExpanded}
                setTeamsSectionExpanded={s.setTeamsSectionExpanded}
                expandedDepartmentIds={s.expandedDepartmentIds}
                setExpandedDepartmentIds={s.setExpandedDepartmentIds}
                isMiniRail={isMiniRail}
                onNavigate={onNavigate}
              />
              {!isMiniRail ? (
                <Text size="xs" fw={500} c="dimmed" mt="xs" mb={4}>
                  Personal
                </Text>
              ) : null}
              <AppShellSidebarNavLink
                to="/personal"
                label="Personal"
                active={isActive('/personal', s.location.pathname)}
                leftSection={<IconUser size={18} />}
                navLinkStyles={s.navLinkStyles}
                isMiniRail={isMiniRail}
                badgeCount={s.personalCount}
                onNavigate={onNavigate}
              />
              <AppShellSidebarNavLink
                to="/notifications"
                label="Notifications"
                title="Unread in-app notifications (all categories)"
                ariaLabel="Notifications: unread in-app activity across all types"
                active={isActive('/notifications', s.location.pathname)}
                leftSection={<IconBell size={18} />}
                navLinkStyles={s.navLinkStyles}
                isMiniRail={isMiniRail}
                badgeCount={s.unreadNotificationsCount}
                onNavigate={onNavigate}
              />
              {s.hasReviewRights ? (
                <AppShellSidebarNavLink
                  to="/reviews"
                  label="Reviews"
                  title="Open draft requests you can merge or reject"
                  ariaLabel="Reviews: open draft requests awaiting your decision"
                  active={isActive('/reviews', s.location.pathname)}
                  leftSection={<IconClipboardCheck size={18} />}
                  navLinkStyles={s.navLinkStyles}
                  isMiniRail={isMiniRail}
                  badgeCount={s.reviewsCount}
                  onNavigate={onNavigate}
                />
              ) : null}
              <AppShellSidebarNavLink
                to="/shared"
                label="Shared"
                active={isActive('/shared', s.location.pathname)}
                leftSection={<IconShare size={18} />}
                navLinkStyles={s.navLinkStyles}
                isMiniRail={isMiniRail}
                badgeCount={s.sharedCount}
                onNavigate={onNavigate}
              />
            </Stack>
          </MantineAppShell.Section>
        </Box>
        <MantineAppShell.Section>
          {showDesktopToggle ? (
            <Box mb="xs">
              <AppShellSidebarCollapseToggle isMiniRail={isMiniRail} onToggle={onToggleDesktop} />
            </Box>
          ) : null}
          <AppShellAccountMenu
            me={s.me}
            accountMenuOpen={s.accountMenuOpen}
            setAccountMenuOpen={s.setAccountMenuOpen}
            logout={s.logout}
            isMiniRail={isMiniRail}
          />
        </MantineAppShell.Section>
      </Stack>
    </MantineAppShell.Navbar>
  );
}
