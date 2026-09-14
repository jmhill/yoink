import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect, useRef, useState } from 'react';
import {
  activateWaitingServiceWorkerAndReload,
  swallowRegistrationUpdate,
} from './pwa-service-worker';

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const VISIBILITY_DEBOUNCE_MS = 30 * 1000; // 30 seconds

export const usePwaUpdate = () => {
  const lastCheckRef = useRef<number>(0);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>();
  const [isUpdating, setIsUpdating] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        registrationRef.current = registration;
        setInterval(() => {
          swallowRegistrationUpdate(registration);
        }, UPDATE_CHECK_INTERVAL_MS);
      }
    },
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      const registration = registrationRef.current;
      if (document.visibilityState === 'visible' && registration) {
        const now = Date.now();
        if (now - lastCheckRef.current >= VISIBILITY_DEBOUNCE_MS) {
          swallowRegistrationUpdate(registration);
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
    setNeedRefresh(false);
  };

  return {
    needRefresh,
    isUpdating,
    refresh,
    dismiss,
  };
};
