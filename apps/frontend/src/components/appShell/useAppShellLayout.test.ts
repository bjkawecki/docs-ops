import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type * as mantineHooks from '@mantine/hooks';
import { useAppShellLayout } from './useAppShellLayout.js';

vi.mock('@mantine/hooks', async () => {
  const actual = await vi.importActual<typeof mantineHooks>('@mantine/hooks');
  return {
    ...actual,
    useMediaQuery: () => true,
    useFocusReturn: vi.fn(),
  };
});

describe('useAppShellLayout', () => {
  it('uses mini rail when desktop collapsed and sidebar is not pinned', () => {
    const onSidebarCollapsedChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ pinned, collapsed, pathname }) =>
        useAppShellLayout(pathname, pinned, collapsed, onSidebarCollapsedChange),
      { initialProps: { pinned: false, collapsed: false, pathname: '/' } }
    );

    expect(result.current.isMiniRail).toBe(false);
    expect(result.current.navbarWidth).toBe(260);

    act(() => {
      result.current.toggleDesktopCollapsed();
    });

    expect(result.current.isMiniRail).toBe(true);
    expect(result.current.navbarWidth).toBe(64);
    expect(onSidebarCollapsedChange).toHaveBeenCalledWith(true);

    rerender({ pinned: true, collapsed: true, pathname: '/' });

    expect(result.current.isMiniRail).toBe(false);
    expect(result.current.navbarWidth).toBe(260);
  });

  it('closes mobile nav when pathname changes', () => {
    const onSidebarCollapsedChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ pathname }) => useAppShellLayout(pathname, false, false, onSidebarCollapsedChange),
      {
        initialProps: { pathname: '/' },
      }
    );

    act(() => {
      result.current.toggleMobile();
    });
    expect(result.current.mobileOpened).toBe(true);

    rerender({ pathname: '/catalog' });
    expect(result.current.mobileOpened).toBe(false);
  });

  it('hides desktop toggle when sidebar is pinned', () => {
    const onSidebarCollapsedChange = vi.fn();
    const { result } = renderHook(() =>
      useAppShellLayout('/', true, false, onSidebarCollapsedChange)
    );
    expect(result.current.showDesktopToggle).toBe(false);
  });
});
