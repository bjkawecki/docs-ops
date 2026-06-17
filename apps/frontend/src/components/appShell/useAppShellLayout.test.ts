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
    const { result, rerender } = renderHook(
      ({ pinned, pathname }) => useAppShellLayout(pathname, pinned),
      { initialProps: { pinned: false, pathname: '/' } }
    );

    expect(result.current.isMiniRail).toBe(false);
    expect(result.current.navbarWidth).toBe(260);

    act(() => {
      result.current.toggleDesktopCollapsed();
    });

    expect(result.current.isMiniRail).toBe(true);
    expect(result.current.navbarWidth).toBe(64);

    rerender({ pinned: true, pathname: '/' });

    expect(result.current.isMiniRail).toBe(false);
    expect(result.current.navbarWidth).toBe(260);
  });

  it('closes mobile nav when pathname changes', () => {
    const { result, rerender } = renderHook(({ pathname }) => useAppShellLayout(pathname, false), {
      initialProps: { pathname: '/' },
    });

    act(() => {
      result.current.toggleMobile();
    });
    expect(result.current.mobileOpened).toBe(true);

    rerender({ pathname: '/catalog' });
    expect(result.current.mobileOpened).toBe(false);
  });

  it('hides desktop toggle when sidebar is pinned', () => {
    const { result } = renderHook(() => useAppShellLayout('/', true));
    expect(result.current.showDesktopToggle).toBe(false);
  });
});
