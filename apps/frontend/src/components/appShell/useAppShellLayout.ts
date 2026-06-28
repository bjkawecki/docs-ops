import { useEffect } from 'react';
import { useDisclosure, useFocusReturn, useMediaQuery } from '@mantine/hooks';
import {
  DESKTOP_MIN_WIDTH,
  SIDEBAR_WIDTH_EXPANDED,
  SIDEBAR_WIDTH_MINI,
} from './appShellLayoutConstants.js';

export function useAppShellLayout(
  pathname: string,
  sidebarPinned: boolean,
  sidebarCollapsed: boolean,
  onSidebarCollapsedChange: (collapsed: boolean) => void
) {
  const isDesktop = useMediaQuery(DESKTOP_MIN_WIDTH) ?? true;
  const [mobileOpened, { close: closeMobile, toggle: toggleMobile }] = useDisclosure(false);
  const [desktopCollapsed, { close: expandDesktop, open: collapseDesktop }] =
    useDisclosure(sidebarCollapsed);

  useFocusReturn({ opened: mobileOpened, shouldReturnFocus: true });

  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  useEffect(() => {
    if (sidebarPinned) {
      expandDesktop();
    }
  }, [sidebarPinned, expandDesktop]);

  useEffect(() => {
    if (sidebarCollapsed) {
      collapseDesktop();
    } else {
      expandDesktop();
    }
  }, [sidebarCollapsed, collapseDesktop, expandDesktop]);

  const toggleDesktopCollapsed = () => {
    const next = !desktopCollapsed;
    if (next) {
      collapseDesktop();
    } else {
      expandDesktop();
    }
    onSidebarCollapsedChange(next);
  };

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
