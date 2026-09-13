import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MD_BREAKPOINT_PX, useDesktopLayout } from './use-desktop-layout';

const listeners = new Set<(event: MediaQueryListEvent) => void>();

const mockMatchMedia = (matches: boolean) => {
  listeners.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void
      ) => {
        listeners.add(listener);
      },
      removeEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void
      ) => {
        listeners.delete(listener);
      },
    }))
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  listeners.clear();
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
    mockMatchMedia(true);
    const { result } = renderHook(() => useDesktopLayout());
    expect(result.current).toBe(true);

    act(() => {
      for (const listener of listeners) {
        listener({ matches: false } as MediaQueryListEvent);
      }
    });
    expect(result.current).toBe(false);
  });
});
