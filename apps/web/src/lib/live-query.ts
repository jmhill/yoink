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
