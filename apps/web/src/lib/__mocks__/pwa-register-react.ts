import { useState } from 'react';

type UseRegisterSWOptions = {
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: Error) => void;
};

type UseRegisterSWReturn = {
  needRefresh: [boolean, (value: boolean) => void];
  offlineReady: [boolean, (value: boolean) => void];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
};

// These will be set by tests via vi.mock
let mockNeedRefresh = false;
let mockSetNeedRefresh: (value: boolean) => void = () => {};
let mockUpdateServiceWorker: (reloadPage?: boolean) => Promise<void> = async () => {};
let capturedOnRegisteredSW: UseRegisterSWOptions['onRegisteredSW'];

export const __setMockNeedRefresh = (value: boolean) => {
  mockNeedRefresh = value;
};

export const __setMockSetNeedRefresh = (fn: (value: boolean) => void) => {
  mockSetNeedRefresh = fn;
};

export const __setMockUpdateServiceWorker = (fn: (reloadPage?: boolean) => Promise<void>) => {
  mockUpdateServiceWorker = fn;
};

export const __getCapturedOnRegisteredSW = () => capturedOnRegisteredSW;

export const useRegisterSW = (options: UseRegisterSWOptions = {}): UseRegisterSWReturn => {
  const [needRefresh, setNeedRefresh] = useState(mockNeedRefresh);
  const [offlineReady, setOfflineReady] = useState(false);

  // Capture the callback so tests can trigger it
  capturedOnRegisteredSW = options.onRegisteredSW;

  return {
    needRefresh: [needRefresh, mockSetNeedRefresh || setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker: mockUpdateServiceWorker,
  };
};
