export const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const;
export const PWA_RELOAD_FALLBACK_MS = 400;
export const UPDATE_CHECK_FAILURE_DEDUPE_MS = 15 * 60 * 1000;

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

export type CaptureExceptionContext = {
  tags?: Record<string, string>;
};

export type CaptureException = (
  error: unknown,
  context?: CaptureExceptionContext
) => void;

export type ReportUpdateCheckFailure = (error: unknown) => void;

/**
 * Offline / flaky `registration.update()` should reach Sentry, but not
 * on every visibility flap. Same error fingerprint is reported at most
 * once per `minIntervalMs`.
 */
export const createRateLimitedUpdateCheckReporter = (options: {
  captureException: CaptureException;
  minIntervalMs?: number;
  now?: () => number;
}): ReportUpdateCheckFailure => {
  let lastReportedAt = 0;
  let lastFingerprint = '';
  const minIntervalMs = options.minIntervalMs ?? UPDATE_CHECK_FAILURE_DEDUPE_MS;
  const now = options.now ?? Date.now;

  return (error: unknown) => {
    const fingerprint =
      error instanceof Error
        ? `${error.name}:${error.message}`
        : String(error);
    const timestamp = now();
    if (
      fingerprint === lastFingerprint &&
      timestamp - lastReportedAt < minIntervalMs
    ) {
      return;
    }
    lastReportedAt = timestamp;
    lastFingerprint = fingerprint;
    options.captureException(error, {
      tags: { 'pwa.update_check': 'failed' },
    });
  };
};

/**
 * Ask the browser for a new service worker. Failures stay off the UI
 * and are reported through `reportFailure` (Sentry, rate-limited).
 */
export const checkForServiceWorkerUpdate = async (
  registration: ServiceWorkerRegistration,
  reportFailure: ReportUpdateCheckFailure
): Promise<void> => {
  try {
    await Promise.resolve(registration.update());
  } catch (error) {
    reportFailure(error);
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
