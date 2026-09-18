import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MD_BREAKPOINT_PX, useDesktopLayout } from './use-desktop-layout';

const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();

const mockMatchMedia = (initialMatches: boolean) => {
  mediaListeners.clear();
  let matches = initialMatches;
  const media = {
    get matches() {
      return matches;
    },
    media: `(min-width: ${MD_BREAKPOINT_PX}px)`,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      mediaListeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      mediaListeners.delete(listener);
    },
    setMatches(next: boolean) {
      matches = next;
    },
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media)
  );
  return media;
};

afterEach(() => {
  vi.unstubAllGlobals();
  mediaListeners.clear();
});

describe('useDesktopLayout', () => {
  it(`is true at the md sidebar breakpoint (${MD_BREAKPOINT_PX}px)`, () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useDesktopLayout());
    expect(result.current).toBe(true);
  });

  it('is false on a phone layout', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useDesktopLayout());
    expect(result.current).toBe(false);
  });

  it('follows viewport changes so the Tasks drawer can remount', () => {
    const media = mockMatchMedia(true);
    const { result } = renderHook(() => useDesktopLayout());
    expect(result.current).toBe(true);

    act(() => {
      media.setMatches(false);
      for (const listener of mediaListeners) {
        listener({ matches: false } as MediaQueryListEvent);
      }
    });
    expect(result.current).toBe(false);
  });

  it('re-reads matchMedia on resize when the change event is missed', () => {
    const media = mockMatchMedia(true);
    const { result } = renderHook(() => useDesktopLayout());
    expect(result.current).toBe(true);

    act(() => {
      media.setMatches(false);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(false);
  });
});
