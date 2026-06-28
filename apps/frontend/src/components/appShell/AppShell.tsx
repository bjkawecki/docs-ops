import { Outlet } from 'react-router-dom';
import { AppShell as MantineAppShell, Box } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { MeResponse } from '../../api/me-types';
import { meQueryKey } from '../../hooks/useMe';
import { AppShellDebugMenuSlot } from './AppShellDebugMenuSlot.js';
import { AppShellImpersonationBannerSlot } from './AppShellImpersonationBannerSlot.js';
import { AppShellMaintenanceBanner } from './AppShellMaintenanceBanner.js';
import { AppShellMainToolbar } from './AppShellMainToolbar.js';
import { AppShellNavbar } from './AppShellNavbar.js';
import { AppShellSkipLink } from './AppShellSkipLink.js';
import { useMaintenanceStatus } from '../../hooks/useMaintenanceStatus.js';
import { useUpdateInProgressOverlay } from '../../hooks/useUpdateInProgressOverlay.js';
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
  const sidebarPinned = s.me?.preferences?.sidebarPinned ?? false;
  const sidebarCollapsed = s.me?.preferences?.sidebarCollapsed ?? false;
  const queryClient = useQueryClient();

  const patchSidebarCollapsed = useMutation({
    mutationFn: async (collapsed: boolean) => {
      const res = await apiFetch('/api/v1/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ sidebarCollapsed: collapsed }),
      });
      if (!res.ok) throw new Error('Failed to save sidebar preference');
      return res.json() as Promise<{ sidebarCollapsed?: boolean }>;
    },
    onMutate: async (collapsed) => {
      await queryClient.cancelQueries({ queryKey: meQueryKey });
      const previousMe = queryClient.getQueryData<MeResponse>(meQueryKey);
      queryClient.setQueryData(meQueryKey, (old: MeResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          preferences: { ...old.preferences, sidebarCollapsed: collapsed },
        };
      });
      return { previousMe };
    },
    onError: (_err, _collapsed, context) => {
      if (context?.previousMe) {
        queryClient.setQueryData(meQueryKey, context.previousMe);
      }
    },
  });

  const layout = useAppShellLayout(
    s.location.pathname,
    sidebarPinned,
    sidebarCollapsed,
    (collapsed) => {
      patchSidebarCollapsed.mutate(collapsed);
    }
  );

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
