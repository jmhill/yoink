export const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const;
export const PWA_RELOAD_FALLBACK_MS = 400;

export type ControllerChangeContainer = {
  addEventListener: (type: string, listener: () => void) => void;
};

export type ActivateWaitingServiceWorkerOptions = {
  registration: ServiceWorkerRegistration | undefined;
  serviceWorkerContainer: ControllerChangeContainer | undefined;
  reload: () => void;
  scheduleFallback?: (callback: () => void, delayMs: number) => void;
  fallbackDelayMs?: number;
};

/**
 * Fetching sw.js can fail (offline, flaky network, blocked script). Those
 * rejections must not become unhandledrejection noise.
 */
export const swallowRegistrationUpdate = (
  registration: ServiceWorkerRegistration
): void => {
  try {
    void Promise.resolve(registration.update()).catch(() => {
      // Expected when the browser cannot fetch the service worker script.
    });
  } catch {
    // Some browsers throw synchronously from update().
  }
};

/**
 * Activate the waiting worker and reload without another sw.js network check.
 * Reloads on controllerchange (skipWaiting + clientsClaim) or after a short
 * fallback so Refresh never sits idle if activation does not take control.
 */
export const activateWaitingServiceWorkerAndReload = ({
  registration,
  serviceWorkerContainer,
  reload,
  scheduleFallback = (callback, delayMs) => {
    window.setTimeout(callback, delayMs);
  },
  fallbackDelayMs = PWA_RELOAD_FALLBACK_MS,
}: ActivateWaitingServiceWorkerOptions): void => {
  let reloaded = false;
  const reloadOnce = () => {
    if (reloaded) {
      return;
    }
    reloaded = true;
    reload();
  };

  try {
    serviceWorkerContainer?.addEventListener('controllerchange', reloadOnce);
    const waiting = registration?.waiting;
    if (!waiting) {
      reloadOnce();
      return;
    }
    waiting.postMessage(SKIP_WAITING_MESSAGE);
    scheduleFallback(reloadOnce, fallbackDelayMs);
  } catch {
    reloadOnce();
  }
};
