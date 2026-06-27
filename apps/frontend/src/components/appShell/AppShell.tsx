import { Outlet } from 'react-router-dom';
import { AppShell as MantineAppShell, Box } from '@mantine/core';
import { AppShellDebugMenuSlot } from './AppShellDebugMenuSlot.js';
import { AppShellImpersonationBannerSlot } from './AppShellImpersonationBannerSlot.js';
import { AppShellMaintenanceBanner } from './AppShellMaintenanceBanner.js';
import { AppShellMainToolbar } from './AppShellMainToolbar.js';
import { AppShellNavbar } from './AppShellNavbar.js';
import { AppShellSkipLink } from './AppShellSkipLink.js';
import { useMaintenanceStatus } from '../../hooks/useMaintenanceStatus.js';
import { useUpdateInProgressOverlay } from '../../hooks/useUpdateInProgressOverlay.js';
import { useUpdateAutoReload } from '../../hooks/useUpdateAutoReload.js';
import { LiveEventsProvider } from '../../hooks/LiveEventsProvider.js';
import { AppShellUpdateBanner } from './AppShellUpdateBanner.js';
import { useAppShellSidebarData } from './useAppShellSidebarData.js';
import { useAppShellLayout } from './useAppShellLayout.js';
import { MAIN_CONTENT_ID } from './appShellLayoutConstants.js';
import './AppShell.css';

export function AppShell() {
  const s = useAppShellSidebarData();
  const isAdmin = s.me?.user?.isAdmin === true;
  const maintenanceQuery = useMaintenanceStatus();
  const maintenanceStatus = maintenanceQuery.data;
  const updateOverlay = useUpdateInProgressOverlay(isAdmin);
  const autoReload = useUpdateAutoReload({
    enabled: updateOverlay.visible && updateOverlay.phase === 'success',
    redirectTo: '/',
    onComplete: updateOverlay.dismiss,
  });
  const sidebarPinned = s.me?.preferences?.sidebarPinned ?? false;

  const layout = useAppShellLayout(s.location.pathname, sidebarPinned);

  const handleNavigate = () => {
    layout.closeMobile();
  };

  return (
    <LiveEventsProvider>
      <Box style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <AppShellSkipLink />
        <AppShellUpdateBanner
          visible={updateOverlay.visible}
          phase={updateOverlay.phase}
          reloadCountdownSeconds={autoReload.secondsLeft}
          onReload={() => {
            updateOverlay.dismiss();
            window.location.reload();
          }}
        />
        <AppShellMaintenanceBanner status={maintenanceStatus} hidden={updateOverlay.visible} />
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
          <AppShellDebugMenuSlot
            show={s.showDebugMenu}
            adminUsersLoading={s.adminUsersLoading}
            adminUsersError={s.adminUsersError}
            adminUsers={s.adminUsersRes?.items}
            impersonateMutation={s.impersonateMutation}
            resetPlatformMutation={s.resetPlatformMutation}
            reseedPlatformMutation={s.reseedPlatformMutation}
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
              pt={{ base: 'md', md: 'sm' }}
              pb={{ base: 'md', md: 'lg', xl: 'xl' }}
              px={{ base: 'md', md: 'lg', xl: 'xl' }}
              style={{ minHeight: '100%' }}
            >
              <AppShellMainToolbar
                mobileOpened={layout.mobileOpened}
                onToggleMobile={layout.toggleMobile}
              />
              <AppShellImpersonationBannerSlot
                me={s.me}
                resolvedColorScheme={s.resolvedColorScheme}
                stopImpersonateMutation={s.stopImpersonateMutation}
              />
              <Outlet />
            </Box>
          </MantineAppShell.Main>
        </MantineAppShell>
      </Box>
    </LiveEventsProvider>
  );
}
