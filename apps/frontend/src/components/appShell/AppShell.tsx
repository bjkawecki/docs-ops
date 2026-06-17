import { Outlet } from 'react-router-dom';
import { AppShell as MantineAppShell, Box } from '@mantine/core';
import { AppShellDebugMenu } from './AppShellDebugMenu.js';
import { AppShellImpersonationBanner } from './AppShellImpersonationBanner.js';
import { AppShellMaintenanceBanner } from './AppShellMaintenanceBanner.js';
import { AppShellMainToolbar } from './AppShellMainToolbar.js';
import { AppShellNavbar } from './AppShellNavbar.js';
import { AppShellSkipLink } from './AppShellSkipLink.js';
import { useMaintenanceStatus } from '../../hooks/useMaintenanceStatus.js';
import { useAppShellSidebarData } from './useAppShellSidebarData.js';
import { useAppShellLayout } from './useAppShellLayout.js';
import { MAIN_CONTENT_ID } from './appShellLayoutConstants.js';
import './AppShell.css';

export function AppShell() {
  const s = useAppShellSidebarData();
  const maintenanceQuery = useMaintenanceStatus();
  const maintenanceStatus = maintenanceQuery.data;
  const sidebarPinned = s.me?.preferences?.sidebarPinned ?? false;

  const layout = useAppShellLayout(s.location.pathname, sidebarPinned);

  const handleNavigate = () => {
    layout.closeMobile();
  };

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <AppShellSkipLink />
      <AppShellMaintenanceBanner status={maintenanceStatus} />
      <MantineAppShell
        navbar={{
          width: layout.navbarWidth,
          breakpoint: 'sm',
          collapsed: { mobile: layout.mobileNavbarCollapsed, desktop: false },
        }}
        padding={0}
        header={{ height: 0 }}
        style={{ flex: 1, minHeight: 0 }}
      >
        <AppShellDebugMenu
          show={s.showDebugMenu}
          adminUsersLoading={s.adminUsersLoading}
          adminUsersError={s.adminUsersError}
          adminUsers={s.adminUsersRes?.items}
          impersonateMutation={s.impersonateMutation}
        />

        <AppShellNavbar
          s={s}
          isMiniRail={layout.isMiniRail}
          showDesktopToggle={layout.showDesktopToggle}
          onToggleDesktop={layout.toggleDesktopCollapsed}
          onNavigate={handleNavigate}
        />

        <MantineAppShell.Main id={MAIN_CONTENT_ID} component="main">
          <Box
            py={{ base: 'md', md: 'lg', xl: 'xl' }}
            px={{ base: 'md', md: 'lg', xl: 'xl' }}
            style={{ minHeight: '100%' }}
          >
            <AppShellMainToolbar
              mobileOpened={layout.mobileOpened}
              onToggleMobile={layout.toggleMobile}
            />
            <AppShellImpersonationBanner
              me={s.me}
              resolvedColorScheme={s.resolvedColorScheme}
              stopImpersonateMutation={s.stopImpersonateMutation}
            />
            <Outlet />
          </Box>
        </MantineAppShell.Main>
      </MantineAppShell>
    </Box>
  );
}
