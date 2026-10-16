import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { z } from 'zod';
import { ProjectSchema, type Project, type Task } from '@yoink/api-contracts';

/** Collection prefixes the 10s live poll refreshes. Partial-match so pile keys cancel too. */
export const LIVE_QUERY_COLLECTION_KEYS: QueryKey[] = [
  ['captures'],
  ['tasks'],
  ['lists'],
  ['unlisted'],
  ['projects'],
  ['work'],
  ['review'],
];

type TaskListResult = {
  status: number;
  body: { tasks: Task[]; total?: number };
};

type ProjectListResult = {
  status: number;
  body: { projects: Project[] };
};

type ProjectGetResult = {
  status: number;
  body: Project;
};

const TaskListResultSchema = z.object({
  status: z.literal(200),
  body: z.object({
    tasks: z.array(z.unknown()),
    total: z.number().optional(),
  }),
});

const ProjectListResultSchema = z.object({
  status: z.literal(200),
  body: z.object({
    projects: z.array(ProjectSchema),
  }),
});

const ProjectGetResultSchema = z.object({
  status: z.literal(200),
  body: ProjectSchema,
});

const isTaskListResult = (data: unknown): data is TaskListResult =>
  TaskListResultSchema.safeParse(data).success;

/**
 * Open-task list caches the UI actually renders: board filters (not Done),
 * named-pile `['lists', id, 'tasks']`, and unlisted.
 */
export const isLiveOpenTaskListQueryKey = (queryKey: QueryKey): boolean => {
  const [root, second, third, fourth] = queryKey;
  if (root === 'tasks') {
    if (second === 'completed') {
      return false;
    }
    if (second === 'project' && fourth === 'finished') {
      return false;
    }
    return true;
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

const isProjectListResult = (data: unknown): data is ProjectListResult =>
  ProjectListResultSchema.safeParse(data).success;

const isProjectGetResult = (data: unknown): data is ProjectGetResult =>
  ProjectGetResultSchema.safeParse(data).success;

export const snapshotLiveProjects = (
  queryClient: QueryClient
): ReturnType<QueryClient['getQueriesData']> => queryClient.getQueriesData({ queryKey: ['projects'] });

export const mapLiveProjects = (
  queryClient: QueryClient,
  mapProject: (project: Project) => Project
): void => {
  const entries = queryClient.getQueriesData({ queryKey: ['projects'] });
  for (const [queryKey, data] of entries) {
    if (isProjectListResult(data)) {
      queryClient.setQueryData(queryKey, {
        ...data,
        body: {
          ...data.body,
          projects: data.body.projects.map(mapProject),
        },
      });
      continue;
    }
    if (isProjectGetResult(data)) {
      queryClient.setQueryData(queryKey, {
        ...data,
        body: mapProject(data.body),
      });
    }
  }
};

export type NextActionProjectRef = {
  id: string;
  name: string;
};

type NowNextActionsResult = {
  status: number;
  body: { items: { task: Task; project: { id: string; name: string } }[]; total?: number };
};

type NowDueResult = {
  status: number;
  body: { tasks: Task[]; total?: number };
};

const NowNextActionsResultSchema = z.object({
  status: z.literal(200),
  body: z.object({
    items: z.array(
      z.object({
        task: z.object({ id: z.string() }).passthrough(),
        project: z.object({ id: z.string(), name: z.string() }),
      })
    ),
    total: z.number().optional(),
  }),
});

const isNowNextActionsResult = (data: unknown): data is NowNextActionsResult =>
  NowNextActionsResultSchema.safeParse(data).success;

const isNowDueResult = (data: unknown): data is NowDueResult => isTaskListResult(data);

export const isLiveNowQueryKey = (queryKey: QueryKey): boolean => {
  const [root, section] = queryKey;
  return root === 'work' && (section === 'next-actions' || section === 'due');
};

export const snapshotLiveNowSections = (
  queryClient: QueryClient
): ReturnType<QueryClient['getQueriesData']> =>
  queryClient.getQueriesData({
    predicate: (query) => isLiveNowQueryKey(query.queryKey),
  });

export const mapLiveNowSections = (
  queryClient: QueryClient,
  removeTaskId: string
): void => {
  const entries = queryClient.getQueriesData({
    predicate: (query) => isLiveNowQueryKey(query.queryKey),
  });
  for (const [queryKey, data] of entries) {
    if (isNowNextActionsResult(data)) {
      const items = data.body.items.filter((item) => item.task.id !== removeTaskId);
      const total =
        typeof data.body.total === 'number'
          ? Math.max(0, data.body.total + (items.length - data.body.items.length))
          : data.body.total;
      queryClient.setQueryData(queryKey, {
        ...data,
        body: {
          ...data.body,
          items,
          ...(typeof total === 'number' ? { total } : {}),
        },
      });
      continue;
    }
    if (isNowDueResult(data)) {
      const tasks = data.body.tasks.filter((task) => task.id !== removeTaskId);
      const total =
        typeof data.body.total === 'number'
          ? Math.max(0, data.body.total + (tasks.length - data.body.tasks.length))
          : data.body.total;
      queryClient.setQueryData(queryKey, {
        ...data,
        body: {
          ...data.body,
          tasks,
          ...(typeof total === 'number' ? { total } : {}),
        },
      });
    }
  }
};

export const projectsWithNextAction = (
  queryClient: QueryClient,
  taskId: string
): NextActionProjectRef[] => {
  const found = new Map<string, NextActionProjectRef>();
  const entries = queryClient.getQueriesData({ queryKey: ['projects'] });
  for (const [, data] of entries) {
    const projects = isProjectListResult(data)
      ? data.body.projects
      : isProjectGetResult(data)
        ? [data.body]
        : [];
    for (const project of projects) {
      if (project.nextActionTaskId === taskId) {
        found.set(project.id, { id: project.id, name: project.name });
      }
    }
  }
  const nowEntries = queryClient.getQueriesData({ queryKey: ['work', 'next-actions'] });
  for (const [, data] of nowEntries) {
    if (!isNowNextActionsResult(data)) {
      continue;
    }
    for (const item of data.body.items) {
      if (item.task.id === taskId) {
        found.set(item.project.id, { id: item.project.id, name: item.project.name });
      }
    }
  }
  return [...found.values()];
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
    const tasks = mapTasks(data.body.tasks, queryKey);
    const total =
      typeof data.body.total === 'number'
        ? Math.max(0, data.body.total + (tasks.length - data.body.tasks.length))
        : data.body.total;
    queryClient.setQueryData(queryKey, {
      ...data,
      body: {
        ...data.body,
        tasks,
        ...(typeof total === 'number' ? { total } : {}),
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

export type LiveQuerySnapshot = {
  state: {
    dataUpdatedAt: number;
    error: unknown;
    errorUpdatedAt: number;
  };
};

export type RetryAfterQuery = {
  error: unknown;
  nowMs: number;
};

export type RetryAfterResult = {
  waitMs: number | null;
};

export type FocusRefetchQuery = {
  dataUpdatedAt: number;
  nowMs: number;
  intervalMs: number;
  retryAfterUntilMs?: number;
};

export type FocusRefetchResult = {
  refetch: boolean;
};

export type LiveRefetchIntervalQuery = {
  visibilityState: 'hidden' | 'visible';
  dataUpdatedAt: number;
  nowMs: number;
  intervalMs: number;
  retryAfterUntilMs?: number;
};

export type LiveRefetchIntervalResult = {
  intervalMs: number | false;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isHeaderGetter = (
  value: unknown
): value is { get: (name: string) => string | null } =>
  typeof value === 'object' &&
  value !== null &&
  'get' in value &&
  typeof value.get === 'function';

const retryAfterHeaderValue = (headers: unknown): string | undefined => {
  if (isHeaderGetter(headers)) {
    return headers.get('retry-after') ?? headers.get('Retry-After') ?? undefined;
  }
  if (!isRecord(headers)) {
    return undefined;
  }
  const raw = headers['retry-after'] ?? headers['Retry-After'];
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw) && typeof raw[0] === 'string') {
    return raw[0];
  }
  return undefined;
};

const httpStatusOf = (error: unknown): number | undefined => {
  if (!isRecord(error)) {
    return undefined;
  }
  const status = error.status ?? error.statusCode;
  return typeof status === 'number' ? status : undefined;
};

const parseRetryAfterMs = (raw: string, nowMs: number): number | undefined => {
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const until = Date.parse(raw);
  if (Number.isNaN(until)) {
    return undefined;
  }
  return Math.max(0, until - nowMs);
};

export const decideRetryAfterMs = (query: RetryAfterQuery): RetryAfterResult => {
  if (httpStatusOf(query.error) !== 429) {
    return { waitMs: null };
  }
  const headers = isRecord(query.error) ? query.error.headers : undefined;
  const raw = retryAfterHeaderValue(headers);
  if (raw === undefined) {
    return { waitMs: LIVE_QUERY_REFETCH_INTERVAL_MS };
  }
  const parsed = parseRetryAfterMs(raw, query.nowMs);
  return { waitMs: parsed ?? LIVE_QUERY_REFETCH_INTERVAL_MS };
};

export const retryAfterUntilMsFromQuery = (
  query: LiveQuerySnapshot,
  nowMs: number
): number | undefined => {
  const wait = decideRetryAfterMs({ error: query.state.error, nowMs });
  if (wait.waitMs === null) {
    return undefined;
  }
  return query.state.errorUpdatedAt + wait.waitMs;
};

export const liveQueryRetryDelayMs = (input: {
  error: unknown;
  nowMs: number;
  failureCount: number;
}): number => {
  const retryAfter = decideRetryAfterMs({ error: input.error, nowMs: input.nowMs });
  if (retryAfter.waitMs !== null) {
    return retryAfter.waitMs;
  }
  return Math.min(1000 * 2 ** input.failureCount, 30_000);
};

/**
 * Skip the extra focus refetch when the 10s poll is already due (or we are
 * sitting out a 429 Retry-After). The interval timer covers the refresh.
 */
export const decideFocusRefetch = (query: FocusRefetchQuery): FocusRefetchResult => {
  if (
    query.retryAfterUntilMs !== undefined &&
    query.nowMs < query.retryAfterUntilMs
  ) {
    return { refetch: false };
  }
  if (query.dataUpdatedAt === 0) {
    return { refetch: true };
  }
  if (query.nowMs >= query.dataUpdatedAt + query.intervalMs) {
    return { refetch: false };
  }
  return { refetch: true };
};

export const decideLiveRefetchInterval = (
  query: LiveRefetchIntervalQuery
): LiveRefetchIntervalResult => {
  if (query.visibilityState === 'hidden') {
    return { intervalMs: false };
  }
  if (
    query.retryAfterUntilMs !== undefined &&
    query.nowMs < query.retryAfterUntilMs
  ) {
    return { intervalMs: query.retryAfterUntilMs - query.nowMs };
  }
  if (query.dataUpdatedAt > 0 && query.nowMs >= query.dataUpdatedAt + query.intervalMs) {
    return { intervalMs: 1 };
  }
  return { intervalMs: query.intervalMs };
};

const visibilityState = (): 'hidden' | 'visible' =>
  typeof document !== 'undefined' && document.visibilityState === 'hidden'
    ? 'hidden'
    : 'visible';

/**
 * TanStack Query calls this after each fetch to schedule the next one.
 * Hidden tabs return `false` so the timer does not keep firing in the background.
 * `refetchIntervalInBackground: false` is the other half of the same pause.
 */
export const liveQueryRefetchInterval = (
  query?: LiveQuerySnapshot
): number | false =>
  decideLiveRefetchInterval({
    visibilityState: visibilityState(),
    dataUpdatedAt: query?.state.dataUpdatedAt ?? 0,
    nowMs: Date.now(),
    intervalMs: readLiveQueryIntervalMs(),
    retryAfterUntilMs:
      query === undefined ? undefined : retryAfterUntilMsFromQuery(query, Date.now()),
  }).intervalMs;

export const liveQueryRefetchOnWindowFocus = (query: LiveQuerySnapshot): boolean =>
  decideFocusRefetch({
    dataUpdatedAt: query.state.dataUpdatedAt,
    nowMs: Date.now(),
    intervalMs: readLiveQueryIntervalMs(),
    retryAfterUntilMs: retryAfterUntilMsFromQuery(query, Date.now()),
  }).refetch;

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
        refetchOnWindowFocus: liveQueryRefetchOnWindowFocus,
        retryDelay: (failureCount, error) =>
          liveQueryRetryDelayMs({ error, nowMs: Date.now(), failureCount }),
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
