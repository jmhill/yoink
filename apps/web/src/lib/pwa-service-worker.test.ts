import { describe, it, expect, vi } from 'vitest';
import {
  SKIP_WAITING_MESSAGE,
  PWA_RELOAD_FALLBACK_MS,
  UPDATE_CHECK_FAILURE_DEDUPE_MS,
  checkForServiceWorkerUpdate,
  createRateLimitedUpdateCheckReporter,
  activateWaitingServiceWorkerAndReload,
} from './pwa-service-worker';

describe('checkForServiceWorkerUpdate', () => {
  it('calls registration.update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const reportFailure = vi.fn();

    await checkForServiceWorkerUpdate(
      { update } as unknown as ServiceWorkerRegistration,
      reportFailure
    );

    expect(update).toHaveBeenCalledTimes(1);
    expect(reportFailure).not.toHaveBeenCalled();
  });

  it('reports a rejected update() without throwing', async () => {
    const error = new TypeError(
      "Failed to update a ServiceWorker for scope ('https://example/') with script ('https://example/sw.js'): An unknown error occurred when fetching the script."
    );
    const update = vi.fn().mockRejectedValue(error);
    const reportFailure = vi.fn();

    await expect(
      checkForServiceWorkerUpdate(
        { update } as unknown as ServiceWorkerRegistration,
        reportFailure
      )
    ).resolves.toBeUndefined();

    expect(reportFailure).toHaveBeenCalledWith(error);
  });

  it('reports a synchronous throw from update() without throwing', async () => {
    const error = new TypeError('Failed to update a ServiceWorker');
    const update = vi.fn(() => {
      throw error;
    });
    const reportFailure = vi.fn();

    await expect(
      checkForServiceWorkerUpdate(
        { update } as unknown as ServiceWorkerRegistration,
        reportFailure
      )
    ).resolves.toBeUndefined();

    expect(reportFailure).toHaveBeenCalledWith(error);
  });
});

describe('createRateLimitedUpdateCheckReporter', () => {
  it('reports the first failure to Sentry with a clear tag', () => {
    const captureException = vi.fn();
    const report = createRateLimitedUpdateCheckReporter({
      captureException,
      now: () => 1_000,
    });
    const error = new TypeError('Failed to update a ServiceWorker');

    report(error);

    expect(captureException).toHaveBeenCalledWith(error, {
      tags: { 'pwa.update_check': 'failed' },
    });
  });

  it('dedupes the same offline error within the interval', () => {
    let now = 1_000;
    const captureException = vi.fn();
    const report = createRateLimitedUpdateCheckReporter({
      captureException,
      now: () => now,
    });
    const error = new TypeError('Failed to update a ServiceWorker');

    report(error);
    now += UPDATE_CHECK_FAILURE_DEDUPE_MS - 1;
    report(error);

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('reports again after the interval so a later outage is visible', () => {
    let now = 1_000;
    const captureException = vi.fn();
    const report = createRateLimitedUpdateCheckReporter({
      captureException,
      now: () => now,
    });
    const error = new TypeError('Failed to update a ServiceWorker');

    report(error);
    now += UPDATE_CHECK_FAILURE_DEDUPE_MS;
    report(error);

    expect(captureException).toHaveBeenCalledTimes(2);
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
