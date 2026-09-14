import { describe, it, expect, vi } from 'vitest';
import {
  SKIP_WAITING_MESSAGE,
  PWA_RELOAD_FALLBACK_MS,
  swallowRegistrationUpdate,
  activateWaitingServiceWorkerAndReload,
} from './pwa-service-worker';

describe('swallowRegistrationUpdate', () => {
  it('calls registration.update()', () => {
    const update = vi.fn().mockResolvedValue(undefined);
    swallowRegistrationUpdate({
      update,
    } as unknown as ServiceWorkerRegistration);

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected update() promise', async () => {
    const update = vi.fn().mockRejectedValue(
      new TypeError(
        "Failed to update a ServiceWorker for scope ('https://example/') with script ('https://example/sw.js'): An unknown error occurred when fetching the script."
      )
    );

    swallowRegistrationUpdate({
      update,
    } as unknown as ServiceWorkerRegistration);

    await Promise.resolve();
    await Promise.resolve();

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('swallows a synchronous throw from update()', () => {
    const update = vi.fn(() => {
      throw new TypeError('Failed to update a ServiceWorker');
    });

    expect(() =>
      swallowRegistrationUpdate({
        update,
      } as unknown as ServiceWorkerRegistration)
    ).not.toThrow();
  });
});

describe('activateWaitingServiceWorkerAndReload', () => {
  it('posts SKIP_WAITING to the waiting worker and reloads on controllerchange', () => {
    const postMessage = vi.fn();
    const reload = vi.fn();
    const scheduleFallback = vi.fn();
    let onControllerChange: (() => void) | undefined;

    activateWaitingServiceWorkerAndReload({
      registration: {
        waiting: { postMessage },
      } as unknown as ServiceWorkerRegistration,
      serviceWorkerContainer: {
        addEventListener: (type, listener) => {
          if (type === 'controllerchange') {
            onControllerChange = listener;
          }
        },
      },
      reload,
      scheduleFallback,
    });

    expect(postMessage).toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
    expect(scheduleFallback).toHaveBeenCalledWith(
      expect.any(Function),
      PWA_RELOAD_FALLBACK_MS
    );
    expect(reload).not.toHaveBeenCalled();

    onControllerChange?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not call registration.update() on the refresh path', () => {
    const update = vi.fn();
    const reload = vi.fn();

    activateWaitingServiceWorkerAndReload({
      registration: {
        update,
        waiting: { postMessage: vi.fn() },
      } as unknown as ServiceWorkerRegistration,
      serviceWorkerContainer: { addEventListener: vi.fn() },
      reload,
      scheduleFallback: vi.fn(),
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('hard-reloads on fallback if controllerchange never fires', () => {
    const reload = vi.fn();
    let fallback: (() => void) | undefined;

    activateWaitingServiceWorkerAndReload({
      registration: {
        waiting: { postMessage: vi.fn() },
      } as unknown as ServiceWorkerRegistration,
      serviceWorkerContainer: { addEventListener: vi.fn() },
      reload,
      scheduleFallback: (callback) => {
        fallback = callback;
      },
    });

    expect(reload).not.toHaveBeenCalled();
    fallback?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads only once if both controllerchange and fallback fire', () => {
    const reload = vi.fn();
    let onControllerChange: (() => void) | undefined;
    let fallback: (() => void) | undefined;

    activateWaitingServiceWorkerAndReload({
      registration: {
        waiting: { postMessage: vi.fn() },
      } as unknown as ServiceWorkerRegistration,
      serviceWorkerContainer: {
        addEventListener: (type, listener) => {
          if (type === 'controllerchange') {
            onControllerChange = listener;
          }
        },
      },
      reload,
      scheduleFallback: (callback) => {
        fallback = callback;
      },
    });

    onControllerChange?.();
    fallback?.();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('hard-reloads immediately when no waiting worker is present', () => {
    const reload = vi.fn();
    const scheduleFallback = vi.fn();

    activateWaitingServiceWorkerAndReload({
      registration: { waiting: null } as unknown as ServiceWorkerRegistration,
      serviceWorkerContainer: { addEventListener: vi.fn() },
      reload,
      scheduleFallback,
    });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(scheduleFallback).not.toHaveBeenCalled();
  });

  it('hard-reloads immediately when registration is missing', () => {
    const reload = vi.fn();

    activateWaitingServiceWorkerAndReload({
      registration: undefined,
      serviceWorkerContainer: { addEventListener: vi.fn() },
      reload,
      scheduleFallback: vi.fn(),
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('hard-reloads if skipWaiting postMessage throws', () => {
    const reload = vi.fn();

    activateWaitingServiceWorkerAndReload({
      registration: {
        waiting: {
          postMessage: () => {
            throw new Error('Failed to update a ServiceWorker');
          },
        },
      } as unknown as ServiceWorkerRegistration,
      serviceWorkerContainer: { addEventListener: vi.fn() },
      reload,
      scheduleFallback: vi.fn(),
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
