import { QueryClient } from '@tanstack/react-query';

/** Product lock: 10–15s is fine; pick the fast end so a slow request still lands inside 15s. */
export const LIVE_QUERY_REFETCH_INTERVAL_MS = 10_000;

/** Playwright sets this before calling the setter hook so E2E does not wait a real 10s. */
export const LIVE_QUERY_TEST_INTERVAL_KEY = '__YOINK_LIVE_QUERY_INTERVAL_MS';

/** Installed on `window` in the web app so E2E can shorten the interval and reschedule. */
export const LIVE_QUERY_TEST_SET_KEY = '__YOINK_SET_LIVE_QUERY_INTERVAL_MS';

type LiveQueryTestWindow = Window & {
  [LIVE_QUERY_TEST_INTERVAL_KEY]?: number;
  [LIVE_QUERY_TEST_SET_KEY]?: (intervalMs: number) => void;
};

const liveQueryTestWindow = (): LiveQueryTestWindow | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window as LiveQueryTestWindow;
};

export const readLiveQueryIntervalMs = (): number => {
  const override = liveQueryTestWindow()?.[LIVE_QUERY_TEST_INTERVAL_KEY];
  if (typeof override === 'number' && override > 0) {
    return override;
  }
  return LIVE_QUERY_REFETCH_INTERVAL_MS;
};

/**
 * TanStack Query calls this after each fetch to schedule the next one.
 * Hidden tabs return `false` so the timer does not keep firing in the background.
 * `refetchIntervalInBackground: false` is the other half of the same pause.
 */
export const liveQueryRefetchInterval = (): number | false => {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return false;
  }
  return readLiveQueryIntervalMs();
};

/**
 * Show the full-page error card only when there is nothing to display.
 * A failed background refetch keeps the last good payload — do not replace it
 * with a banner or toast.
 */
export const isBlockingQueryFailure = (error: unknown, data: unknown): boolean =>
  error != null && data === undefined;

export const createAppQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        refetchInterval: liveQueryRefetchInterval,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
      },
    },
  });

export const installLiveQueryTestHook = (queryClient: QueryClient): void => {
  const target = liveQueryTestWindow();
  if (!target) {
    return;
  }
  target[LIVE_QUERY_TEST_SET_KEY] = (intervalMs: number) => {
    target[LIVE_QUERY_TEST_INTERVAL_KEY] = intervalMs;
    void queryClient.invalidateQueries();
  };
};
