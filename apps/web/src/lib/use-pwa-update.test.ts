import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePwaUpdate } from './use-pwa-update';

const mockUpdateServiceWorker = vi.fn();
const mockSetNeedRefresh = vi.fn();
const mockRegistrationUpdate = vi.fn();

let onRegisteredCallback:
  | ((swUrl: string, registration: ServiceWorkerRegistration | undefined) => void)
  | undefined;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: {
    onRegisteredSW?: (
      swUrl: string,
      registration: ServiceWorkerRegistration | undefined
    ) => void;
  }) => {
    onRegisteredCallback = options.onRegisteredSW;
    return {
      needRefresh: [false, mockSetNeedRefresh],
      updateServiceWorker: mockUpdateServiceWorker,
    };
  },
}));

describe('usePwaUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    onRegisteredCallback = undefined;
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockRegistration = (): ServiceWorkerRegistration =>
    ({
      update: mockRegistrationUpdate,
    }) as unknown as ServiceWorkerRegistration;

  describe('periodic update checks', () => {
    it('schedules periodic update check every 5 minutes on registration', () => {
      renderHook(() => usePwaUpdate());

      const registration = createMockRegistration();
      act(() => {
        onRegisteredCallback?.('sw.js', registration);
      });

      expect(mockRegistrationUpdate).not.toHaveBeenCalled();

      // Advance 5 minutes
      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(1);

      // Advance another 5 minutes
      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(2);
    });

    it('does not schedule update check if registration is undefined', () => {
      renderHook(() => usePwaUpdate());

      act(() => {
        onRegisteredCallback?.('sw.js', undefined);
      });

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });
      expect(mockRegistrationUpdate).not.toHaveBeenCalled();
    });
  });

  describe('visibility change updates', () => {
    it('triggers update check when page becomes visible', () => {
      renderHook(() => usePwaUpdate());

      const registration = createMockRegistration();
      act(() => {
        onRegisteredCallback?.('sw.js', registration);
      });

      // Simulate visibility change to visible
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(1);
    });

    it('does not trigger update check when page becomes hidden', () => {
      renderHook(() => usePwaUpdate());

      const registration = createMockRegistration();
      act(() => {
        onRegisteredCallback?.('sw.js', registration);
      });

      // Simulate visibility change to hidden
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(mockRegistrationUpdate).not.toHaveBeenCalled();
    });

    it('debounces visibility checks within 30 seconds', () => {
      renderHook(() => usePwaUpdate());

      const registration = createMockRegistration();
      act(() => {
        onRegisteredCallback?.('sw.js', registration);
      });

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });

      // First visibility change - should trigger update
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(1);

      // Advance 15 seconds (less than debounce threshold)
      act(() => {
        vi.advanceTimersByTime(15 * 1000);
      });

      // Second visibility change - should be debounced
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(1);

      // Advance another 20 seconds (now past debounce threshold)
      act(() => {
        vi.advanceTimersByTime(20 * 1000);
      });

      // Third visibility change - should trigger update
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(2);
    });

    it('does not trigger update check if registration is not available', () => {
      renderHook(() => usePwaUpdate());

      // Don't call onRegisteredCallback, so registration is undefined

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(mockRegistrationUpdate).not.toHaveBeenCalled();
    });

    it('cleans up visibility listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { unmount } = renderHook(() => usePwaUpdate());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('refresh', () => {
    it('calls updateServiceWorker with true when refresh is called', () => {
      const { result } = renderHook(() => usePwaUpdate());

      act(() => {
        result.current.refresh();
      });

      expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);
    });
  });

  describe('dismiss', () => {
    it('sets needRefresh to false when dismiss is called', () => {
      const { result } = renderHook(() => usePwaUpdate());

      act(() => {
        result.current.dismiss();
      });

      expect(mockSetNeedRefresh).toHaveBeenCalledWith(false);
    });
  });
});
