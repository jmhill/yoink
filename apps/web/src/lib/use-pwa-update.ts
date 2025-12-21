import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect, useRef } from 'react';

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const VISIBILITY_DEBOUNCE_MS = 30 * 1000; // 30 seconds

export const usePwaUpdate = () => {
  const lastCheckRef = useRef<number>(0);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        registrationRef.current = registration;
        setInterval(() => {
          registration.update();
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
          registration.update();
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
    updateServiceWorker(true);
  };

  const dismiss = () => {
    setNeedRefresh(false);
  };

  return {
    needRefresh,
    refresh,
    dismiss,
  };
};
