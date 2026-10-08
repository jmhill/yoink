import { QueryClient, type QueryKey } from '@tanstack/react-query';
import type { Task } from '@yoink/api-contracts';

/** Collection prefixes the 10s live poll refreshes. Partial-match so pile keys cancel too. */
export const LIVE_QUERY_COLLECTION_KEYS: QueryKey[] = [
  ['captures'],
  ['tasks'],
  ['lists'],
  ['unlisted'],
];

type TaskListResult = {
  status: number;
  body: { tasks: Task[] };
};

const isTaskListResult = (data: unknown): data is TaskListResult => {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const result = data as { status?: unknown; body?: { tasks?: unknown } };
  return result.status === 200 && Array.isArray(result.body?.tasks);
};

/**
 * Open-task list caches the UI actually renders: board filters (not Done),
 * named-pile `['lists', id, 'tasks']`, and unlisted.
 */
export const isLiveOpenTaskListQueryKey = (queryKey: QueryKey): boolean => {
  const [root, second, third] = queryKey;
  if (root === 'tasks') {
    return second !== 'completed';
  }
  if (root === 'unlisted' && second === 'tasks') {
    return true;
  }
  return root === 'lists' && third === 'tasks';
};

export const cancelLiveQueries = async (queryClient: QueryClient): Promise<void> => {
  await Promise.all(
    LIVE_QUERY_COLLECTION_KEYS.map((queryKey) => queryClient.cancelQueries({ queryKey }))
  );
};

export const invalidateLiveQueries = (queryClient: QueryClient): Promise<void> =>
  Promise.all(
    LIVE_QUERY_COLLECTION_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  ).then(() => undefined);

export const snapshotLiveOpenTaskLists = (
  queryClient: QueryClient
): ReturnType<QueryClient['getQueriesData']> =>
  queryClient.getQueriesData({
    predicate: (query) => isLiveOpenTaskListQueryKey(query.queryKey),
  });

export const restoreQuerySnapshots = (
  queryClient: QueryClient,
  snapshots: ReturnType<QueryClient['getQueriesData']>
): void => {
  for (const [queryKey, data] of snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
};

export const mapLiveOpenTaskLists = (
  queryClient: QueryClient,
  mapTasks: (tasks: Task[], queryKey: QueryKey) => Task[]
): void => {
  const entries = queryClient.getQueriesData({
    predicate: (query) => isLiveOpenTaskListQueryKey(query.queryKey),
  });
  for (const [queryKey, data] of entries) {
    if (!isTaskListResult(data)) {
      continue;
    }
    queryClient.setQueryData(queryKey, {
      ...data,
      body: {
        ...data.body,
        tasks: mapTasks(data.body.tasks, queryKey),
      },
    });
  }
};

/** Product lock: 10–15s is fine; pick the fast end so a slow request still lands inside 15s. */
export const LIVE_QUERY_REFETCH_INTERVAL_MS = 10_000;

/** Playwright sets this before calling the setter hook so E2E does not wait a real 10s. */
export const LIVE_QUERY_TEST_INTERVAL_KEY = '__YOINK_LIVE_QUERY_INTERVAL_MS';

/** Installed on `window` in the web app so E2E can shorten the interval and reschedule. */
export const LIVE_QUERY_TEST_SET_KEY = '__YOINK_SET_LIVE_QUERY_INTERVAL_MS';

type LiveQueryTestWindow = Window & {
  [LIVE_QUERY_TEST_INTERVAL_KEY]?: number;
  [LIVE_QUERY_TEST_SET_KEY]?: (intervalMs: number) => void | Promise<void>;
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
  target[LIVE_QUERY_TEST_SET_KEY] = async (intervalMs: number) => {
    target[LIVE_QUERY_TEST_INTERVAL_KEY] = intervalMs;
    await queryClient.cancelQueries();
    await queryClient.invalidateQueries();
  };
};
