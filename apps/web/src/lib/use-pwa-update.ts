import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect, useRef, useState } from 'react';
import { Sentry } from '../instrument';
import {
  activateWaitingServiceWorkerAndReload,
  checkForServiceWorkerUpdate,
  createRateLimitedUpdateCheckReporter,
} from './pwa-service-worker';

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const VISIBILITY_DEBOUNCE_MS = 30 * 1000; // 30 seconds

export const usePwaUpdate = () => {
  const lastCheckRef = useRef<number>(0);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>();
  const dismissedThisSessionRef = useRef(false);
  const setNeedRefreshRef = useRef<(value: boolean) => void>(() => {});
  const reportUpdateCheckFailureRef = useRef(
    createRateLimitedUpdateCheckReporter({
      captureException: (error, context) => {
        Sentry.captureException(error, context);
      },
    })
  );
  const [isUpdating, setIsUpdating] = useState(false);

  const offerRefreshIfWaiting = (registration: ServiceWorkerRegistration) => {
    if (registration.waiting && !dismissedThisSessionRef.current) {
      setNeedRefreshRef.current(true);
    }
  };

  const runUpdateCheck = async (registration: ServiceWorkerRegistration) => {
    await checkForServiceWorkerUpdate(
      registration,
      reportUpdateCheckFailureRef.current
    );
    offerRefreshIfWaiting(registration);
  };

  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return;
      }
      registrationRef.current = registration;
      offerRefreshIfWaiting(registration);
      void runUpdateCheck(registration);
      lastCheckRef.current = Date.now();
      setInterval(() => {
        void runUpdateCheck(registration);
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  setNeedRefreshRef.current = setNeedRefresh;

  useEffect(() => {
    const handleVisibilityChange = () => {
      const registration = registrationRef.current;
      if (document.visibilityState === 'visible' && registration) {
        const now = Date.now();
        if (now - lastCheckRef.current >= VISIBILITY_DEBOUNCE_MS) {
          void runUpdateCheck(registration);
          lastCheckRef.current = now;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const refresh = () => {
    // Do not call vite-plugin-pwa's updateServiceWorker(): it only skipWaits
    // and waits for `controlling`, with no fallback if claim never fires.
    setIsUpdating(true);
    activateWaitingServiceWorkerAndReload({
      registration: registrationRef.current,
      serviceWorkerContainer:
        typeof navigator !== 'undefined' && 'serviceWorker' in navigator
          ? navigator.serviceWorker
          : undefined,
      reload: () => {
        window.location.reload();
      },
    });
  };

  const dismiss = () => {
    dismissedThisSessionRef.current = true;
    setNeedRefresh(false);
  };

  return {
    needRefresh,
    isUpdating,
    refresh,
    dismiss,
  };
};
