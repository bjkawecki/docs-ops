import { Link, Outlet } from 'react-router-dom';
import { AppShell as MantineAppShell, Stack, NavLink, Box, Text, Divider } from '@mantine/core';
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
import { AppShellDebugMenu } from './AppShellDebugMenu.js';
import { AppShellImpersonationBanner } from './AppShellImpersonationBanner.js';
import { AppShellRoleBasedNav } from './AppShellRoleBasedNav.js';
import { isActive } from './appShellNavUtils.js';
import { useAppShellSidebarData } from './useAppShellSidebarData.js';

export function AppShell() {
  const s = useAppShellSidebarData();

  return (
    <MantineAppShell navbar={{ width: 260, breakpoint: 'sm' }} padding={0} header={{ height: 0 }}>
      <AppShellDebugMenu
        show={s.showDebugMenu}
        adminUsersLoading={s.adminUsersLoading}
        adminUsersError={s.adminUsersError}
        adminUsers={s.adminUsersRes?.items}
        impersonateMutation={s.impersonateMutation}
      />

      <MantineAppShell.Navbar p="md">
        <Stack justify="space-between" style={{ height: '100%' }}>
          <Box data-sidebar-nav>
            <MantineAppShell.Section>
              <Link
                to="/"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <DocopsLogo width={40} height={40} />
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
              </Link>
              <Divider my="sm" />
            </MantineAppShell.Section>
            <MantineAppShell.Section mt="xl">
              <Stack gap={4}>
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/"
                  label="Dashboard"
                  active={isActive('/', s.location.pathname)}
                  leftSection={<IconLayoutDashboard size={18} />}
                  styles={s.navLinkStyles}
                />
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/catalog"
                  label="Catalog"
                  active={isActive('/catalog', s.location.pathname)}
                  leftSection={<IconListSearch size={18} />}
                  rightSection={
                    s.catalogCount !== undefined && s.catalogCount > 0 ? (
                      <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                        {s.catalogCount}
                      </Text>
                    ) : null
                  }
                  styles={s.navLinkStyles}
                />
                <Text size="xs" fw={500} c="dimmed" mt="xs" mb={4}>
                  Organization
                </Text>
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
                />
                <Text size="xs" fw={500} c="dimmed" mt="xs" mb={4}>
                  Personal
                </Text>
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/personal"
                  label="Personal"
                  active={isActive('/personal', s.location.pathname)}
                  leftSection={<IconUser size={18} />}
                  rightSection={
                    s.personalCount !== undefined && s.personalCount > 0 ? (
                      <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                        {s.personalCount}
                      </Text>
                    ) : null
                  }
                  styles={s.navLinkStyles}
                />
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/notifications"
                  label="Notifications"
                  title="Unread in-app notifications (all categories)"
                  aria-label="Notifications: unread in-app activity across all types"
                  active={isActive('/notifications', s.location.pathname)}
                  leftSection={<IconBell size={18} />}
                  rightSection={
                    s.unreadNotificationsCount > 0 ? (
                      <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                        {s.unreadNotificationsCount > 99 ? '99+' : s.unreadNotificationsCount}
                      </Text>
                    ) : null
                  }
                  styles={s.navLinkStyles}
                />
                {s.hasReviewRights && (
                  <NavLink
                    data-sidebar-link
                    component={Link}
                    to="/reviews"
                    label="Reviews"
                    title="Open draft requests you can merge or reject"
                    aria-label="Reviews: open draft requests awaiting your decision"
                    active={isActive('/reviews', s.location.pathname)}
                    leftSection={<IconClipboardCheck size={18} />}
                    rightSection={
                      s.reviewsCount !== undefined && s.reviewsCount > 0 ? (
                        <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                          {s.reviewsCount}
                        </Text>
                      ) : null
                    }
                    styles={s.navLinkStyles}
                  />
                )}
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/shared"
                  label="Shared"
                  active={isActive('/shared', s.location.pathname)}
                  leftSection={<IconShare size={18} />}
                  rightSection={
                    s.sharedCount !== undefined && s.sharedCount > 0 ? (
                      <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                        {s.sharedCount}
                      </Text>
                    ) : null
                  }
                  styles={s.navLinkStyles}
                />
              </Stack>
            </MantineAppShell.Section>
          </Box>
          <MantineAppShell.Section>
            <AppShellAccountMenu
              me={s.me}
              accountMenuOpen={s.accountMenuOpen}
              setAccountMenuOpen={s.setAccountMenuOpen}
              logout={s.logout}
            />
          </MantineAppShell.Section>
        </Stack>
      </MantineAppShell.Navbar>
      <MantineAppShell.Main>
        <Box
          py={{ base: 'md', md: 'lg', xl: 'xl' }}
          px={{ base: 'md', md: 'lg', xl: 'xl' }}
          style={{ minHeight: '100%' }}
        >
          <AppShellImpersonationBanner
            me={s.me}
            resolvedColorScheme={s.resolvedColorScheme}
            stopImpersonateMutation={s.stopImpersonateMutation}
          />
          <Outlet />
        </Box>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
