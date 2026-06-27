import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_AUTO_RELOAD_SECONDS, useUpdateAutoReload } from './useUpdateAutoReload.js';

describe('useUpdateAutoReload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { ...window.location, href: '', reload: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts countdown when enabled', () => {
    const { result } = renderHook(() => useUpdateAutoReload({ enabled: true }));
    expect(result.current.secondsLeft).toBe(UPDATE_AUTO_RELOAD_SECONDS);
  });

  it('counts down each second', () => {
    const { result } = renderHook(() => useUpdateAutoReload({ enabled: true }));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.secondsLeft).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.secondsLeft).toBe(1);
  });

  it('reloads after countdown when no redirectTo is set', () => {
    const onComplete = vi.fn();
    const reloadMock = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: '', reload: reloadMock });
    renderHook(() => useUpdateAutoReload({ enabled: true, onComplete }));

    act(() => {
      vi.advanceTimersByTime(UPDATE_AUTO_RELOAD_SECONDS * 1000);
    });

    expect(onComplete).toHaveBeenCalledOnce();
    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it('navigates to redirectTo after countdown', () => {
    const hrefMock = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: '', assign: hrefMock });
    Object.defineProperty(window.location, 'href', {
      set: hrefMock,
      get: () => '',
    });

    renderHook(() =>
      useUpdateAutoReload({ enabled: true, redirectTo: '/update-status.html?target=0.1.1' })
    );

    act(() => {
      vi.advanceTimersByTime(UPDATE_AUTO_RELOAD_SECONDS * 1000);
    });

    expect(hrefMock).toHaveBeenCalledWith('/update-status.html?target=0.1.1');
  });

  it('clears countdown when disabled', () => {
    const { result, rerender } = renderHook(({ enabled }) => useUpdateAutoReload({ enabled }), {
      initialProps: { enabled: true },
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.secondsLeft).toBe(2);

    rerender({ enabled: false });
    expect(result.current.secondsLeft).toBeNull();
  });
});
