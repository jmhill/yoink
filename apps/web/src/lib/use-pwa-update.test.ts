import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePwaUpdate } from './use-pwa-update';
import { SKIP_WAITING_MESSAGE } from './pwa-service-worker';

const mockUpdateServiceWorker = vi.fn();
const mockSetNeedRefresh = vi.fn();
const mockRegistrationUpdate = vi.fn();
const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

let onRegisteredCallback:
  | ((swUrl: string, registration: ServiceWorkerRegistration | undefined) => void)
  | undefined;

vi.mock('../instrument', () => ({
  Sentry: {
    captureException: (
      error: unknown,
      context?: { tags?: Record<string, string> }
    ) => mockCaptureException(error, context),
  },
}));

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
    vi.resetAllMocks();
    mockRegistrationUpdate.mockResolvedValue(undefined);
    onRegisteredCallback = undefined;
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const createMockRegistration = (
    waiting?: { postMessage: ReturnType<typeof vi.fn> } | null
  ): ServiceWorkerRegistration =>
    ({
      update: mockRegistrationUpdate,
      waiting: waiting === undefined ? null : waiting,
    }) as unknown as ServiceWorkerRegistration;

  const register = (registration: ServiceWorkerRegistration) => {
    act(() => {
      onRegisteredCallback?.('sw.js', registration);
    });
  };

  const flushUpdateCheck = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  describe('startup update checks', () => {
    it('checks for a waiting worker and runs an update immediately on registration', async () => {
      renderHook(() => usePwaUpdate());
      const waiting = { postMessage: vi.fn() };
      register(createMockRegistration(waiting));

      expect(mockSetNeedRefresh).toHaveBeenCalledWith(true);
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(1);

      await flushUpdateCheck();
      expect(mockSetNeedRefresh).toHaveBeenCalledWith(true);
    });

    it('does not show the banner on startup when no worker is waiting', async () => {
      renderHook(() => usePwaUpdate());
      register(createMockRegistration());

      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(1);
      await flushUpdateCheck();
      expect(mockSetNeedRefresh).not.toHaveBeenCalledWith(true);
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

  describe('periodic update checks', () => {
    it('keeps the 5-minute periodic update check after the prompt startup check', () => {
      renderHook(() => usePwaUpdate());
      register(createMockRegistration());

      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(2);

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(3);
    });

    it('reports periodic update fetch failures to Sentry without a user-facing error', async () => {
      const error = new TypeError(
        "Failed to update a ServiceWorker for scope ('https://example/') with script ('https://example/sw.js'): An unknown error occurred when fetching the script."
      );
      mockRegistrationUpdate.mockRejectedValue(error);

      renderHook(() => usePwaUpdate());
      register(createMockRegistration());

      await flushUpdateCheck();
      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        tags: { 'pwa.update_check': 'failed' },
      });

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });

      await flushUpdateCheck();
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(2);
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
    });
  });

  describe('visibility change updates', () => {
    it('triggers update check when page becomes visible after the debounce window', () => {
      renderHook(() => usePwaUpdate());
      register(createMockRegistration());
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(30 * 1000);
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(2);
    });

    it('does not trigger update check when page becomes hidden', () => {
      renderHook(() => usePwaUpdate());
      register(createMockRegistration());
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });

      act(() => {
        vi.advanceTimersByTime(30 * 1000);
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(1);
    });

    it('debounces visibility checks within 30 seconds', () => {
      renderHook(() => usePwaUpdate());
      register(createMockRegistration());

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });

      act(() => {
        vi.advanceTimersByTime(30 * 1000);
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(2);

      act(() => {
        vi.advanceTimersByTime(15 * 1000);
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(2);

      act(() => {
        vi.advanceTimersByTime(20 * 1000);
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(3);
    });

    it('does not trigger update check if registration is not available', () => {
      renderHook(() => usePwaUpdate());

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(mockRegistrationUpdate).not.toHaveBeenCalled();
    });

    it('reports visibility update fetch failures to Sentry without a user-facing error', async () => {
      const error = new TypeError(
        "Failed to update a ServiceWorker for scope ('https://example/') with script ('https://example/sw.js'): An unknown error occurred when fetching the script."
      );
      mockRegistrationUpdate.mockRejectedValue(error);

      renderHook(() => usePwaUpdate());
      register(createMockRegistration());
      await flushUpdateCheck();
      expect(mockCaptureException).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });

      act(() => {
        vi.advanceTimersByTime(30 * 1000);
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await flushUpdateCheck();
      expect(mockRegistrationUpdate).toHaveBeenCalledTimes(2);
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
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
    it('activates the waiting worker without a second update() fetch', () => {
      const postMessage = vi.fn();
      const addEventListener = vi.fn();
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { addEventListener },
      });

      const { result } = renderHook(() => usePwaUpdate());
      register(createMockRegistration({ postMessage }));

      act(() => {
        result.current.refresh();
      });

      expect(postMessage).toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
      expect(mockUpdateServiceWorker).not.toHaveBeenCalled();
      expect(result.current.isUpdating).toBe(true);
    });

    it('hard-reloads when activation has no waiting worker', () => {
      const reload = vi.fn();
      vi.stubGlobal('location', { reload });

      const { result } = renderHook(() => usePwaUpdate());

      act(() => {
        result.current.refresh();
      });

      expect(reload).toHaveBeenCalledTimes(1);
      expect(result.current.isUpdating).toBe(true);
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

    it('does not bring the banner back from later checks in the same session', async () => {
      const { result } = renderHook(() => usePwaUpdate());
      const registration = createMockRegistration({ postMessage: vi.fn() });
      register(registration);
      await flushUpdateCheck();
      mockSetNeedRefresh.mockClear();

      act(() => {
        result.current.dismiss();
      });
      expect(mockSetNeedRefresh).toHaveBeenCalledWith(false);
      mockSetNeedRefresh.mockClear();

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });
      await flushUpdateCheck();
      expect(mockSetNeedRefresh).not.toHaveBeenCalledWith(true);

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await flushUpdateCheck();
      expect(mockSetNeedRefresh).not.toHaveBeenCalledWith(true);
    });

    it('shows the banner again on the next launch while a worker is still waiting', async () => {
      const waiting = { postMessage: vi.fn() };
      const { result, unmount } = renderHook(() => usePwaUpdate());
      register(createMockRegistration(waiting));
      await flushUpdateCheck();

      act(() => {
        result.current.dismiss();
      });
      unmount();
      mockSetNeedRefresh.mockClear();
      mockRegistrationUpdate.mockClear();

      renderHook(() => usePwaUpdate());
      register(createMockRegistration(waiting));
      await flushUpdateCheck();

      expect(mockSetNeedRefresh).toHaveBeenCalledWith(true);
      expect(mockRegistrationUpdate).toHaveBeenCalled();
    });
  });
});
