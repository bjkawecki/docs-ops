import { useEffect } from 'react';
import { useDisclosure, useFocusReturn, useMediaQuery } from '@mantine/hooks';
import {
  DESKTOP_MIN_WIDTH,
  SIDEBAR_WIDTH_EXPANDED,
  SIDEBAR_WIDTH_MINI,
} from './appShellLayoutConstants.js';

export function useAppShellLayout(pathname: string, sidebarPinned: boolean) {
  const isDesktop = useMediaQuery(DESKTOP_MIN_WIDTH) ?? true;
  const [mobileOpened, { close: closeMobile, toggle: toggleMobile }] = useDisclosure(false);
  const [desktopCollapsed, { toggle: toggleDesktopCollapsed, close: expandDesktop }] =
    useDisclosure(false);

  useFocusReturn({ opened: mobileOpened, shouldReturnFocus: true });

  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  useEffect(() => {
    if (sidebarPinned) {
      expandDesktop();
    }
  }, [sidebarPinned, expandDesktop]);

  const isMiniRail = isDesktop && desktopCollapsed && !sidebarPinned;
  const navbarWidth = isMiniRail ? SIDEBAR_WIDTH_MINI : SIDEBAR_WIDTH_EXPANDED;

  return {
    isDesktop,
    mobileOpened,
    toggleMobile,
    closeMobile,
    toggleDesktopCollapsed,
    isMiniRail,
    navbarWidth,
    mobileNavbarCollapsed: !mobileOpened,
    showDesktopToggle: !sidebarPinned && isDesktop,
  };
}
