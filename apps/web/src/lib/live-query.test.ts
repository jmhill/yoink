import { afterEach, describe, expect, it } from 'vitest';
import {
  LIVE_QUERY_REFETCH_INTERVAL_MS,
  LIVE_QUERY_TEST_INTERVAL_KEY,
  cancelLiveQueries,
  createAppQueryClient,
  isBlockingQueryFailure,
  isLiveOpenTaskListQueryKey,
  liveQueryRefetchInterval,
  mapLiveOpenTaskLists,
  readLiveQueryIntervalMs,
} from './live-query';

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
};

describe('live query interval', () => {
  afterEach(() => {
    setVisibility('visible');
    delete (window as Window & { [LIVE_QUERY_TEST_INTERVAL_KEY]?: number })[
      LIVE_QUERY_TEST_INTERVAL_KEY
    ];
  });

  it('defaults to 10 seconds while the document is visible', () => {
    setVisibility('visible');
    expect(readLiveQueryIntervalMs()).toBe(LIVE_QUERY_REFETCH_INTERVAL_MS);
    expect(liveQueryRefetchInterval()).toBe(10_000);
  });

  it('pauses while the tab is hidden', () => {
    setVisibility('hidden');
    expect(liveQueryRefetchInterval()).toBe(false);
  });

  it('uses a test-only override so E2E does not wait the real interval', () => {
    setVisibility('visible');
    (
      window as Window & { [LIVE_QUERY_TEST_INTERVAL_KEY]?: number }
    )[LIVE_QUERY_TEST_INTERVAL_KEY] = 250;
    expect(liveQueryRefetchInterval()).toBe(250);
  });

  it('does not treat a failed background refetch as a blocking error', () => {
    expect(isBlockingQueryFailure(new Error('offline'), { status: 200, body: [] })).toBe(
      false
    );
    expect(isBlockingQueryFailure(new Error('offline'), undefined)).toBe(true);
    expect(isBlockingQueryFailure(null, undefined)).toBe(false);
  });

  it('configures the app QueryClient to poll only while focused', () => {
    const client = createAppQueryClient();
    const queries = client.getDefaultOptions().queries;
    expect(queries?.refetchInterval).toBe(liveQueryRefetchInterval);
    expect(queries?.refetchIntervalInBackground).toBe(false);
    expect(queries?.refetchOnWindowFocus).toBe(true);
  });

  it('treats named-pile and unlisted caches as live open-task lists', () => {
    expect(isLiveOpenTaskListQueryKey(['tasks', 'today'])).toBe(true);
    expect(isLiveOpenTaskListQueryKey(['tasks', 'completed'])).toBe(false);
    expect(isLiveOpenTaskListQueryKey(['lists'])).toBe(false);
    expect(isLiveOpenTaskListQueryKey(['lists', 'list-1', 'tasks'])).toBe(true);
    expect(isLiveOpenTaskListQueryKey(['unlisted', 'tasks'])).toBe(true);
    expect(isLiveOpenTaskListQueryKey(['tasks', 'project', 'project-1'])).toBe(true);
    expect(isLiveOpenTaskListQueryKey(['captures', 'inbox'])).toBe(false);
  });

  it('does not let a cancelled in-flight pile poll overwrite a user mutation', async () => {
    const client = createAppQueryClient();
    const key = ['lists', '11111111-1111-1111-1111-111111111111', 'tasks'];
    const eggs = {
      id: 'eggs',
      organizationId: 'org',
      createdById: 'user',
      title: 'Eggs',
      createdAt: '2026-10-08T00:00:00.000Z',
      lastChangedAt: null,
      lastChangedBy: null,
      completedBy: null,
    };
    const stale = { status: 200, body: { tasks: [eggs] } };
    const mutated = { status: 200, body: { tasks: [] } };
    client.setQueryData(key, stale);

    let resolveFetch: (value: typeof stale) => void = () => undefined;
    const delayed = new Promise<typeof stale>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchPromise = client.prefetchQuery({
      queryKey: key,
      queryFn: () => delayed,
    });

    await cancelLiveQueries(client);
    mapLiveOpenTaskLists(client, (tasks) => tasks.filter((task) => task.id !== 'eggs'));
    resolveFetch(stale);
    await fetchPromise.catch(() => undefined);

    expect(client.getQueryData(key)).toEqual(mutated);
  });
});
