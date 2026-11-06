import { useInfiniteQuery } from '@tanstack/react-query';
import { type HistoryPage } from '@yoink/api-contracts';
import { projectClient } from '@/api/client';

/** History and Finished open with the 10 newest rows. */
export const PROJECT_TIMELINE_FIRST_PAGE_SIZE = 10;

/** Show more on History and Finished loads 20 at a time. */
export const PROJECT_TIMELINE_MORE_PAGE_SIZE = 20;

const nextHistoryCursor = (lastPage: { hasMore: boolean; nextCursor: string | null }) => {
  if (lastPage.hasMore !== true) {
    return undefined;
  }
  return lastPage.nextCursor ?? undefined;
};

const historyCursor = (pageParam: unknown): string | undefined =>
  typeof pageParam === 'string' && pageParam.length > 0 ? pageParam : undefined;

const timelinePageLimit = (pageParam: unknown): number =>
  historyCursor(pageParam) === undefined
    ? PROJECT_TIMELINE_FIRST_PAGE_SIZE
    : PROJECT_TIMELINE_MORE_PAGE_SIZE;

export const useProjectHistoryPages = (projectId: string, enabled: boolean) => {
  const query = useInfiniteQuery({
    queryKey: ['projects', projectId, 'history'],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const cursor = historyCursor(pageParam);
      return projectClient.listHistory({
        id: projectId,
        limit: timelinePageLimit(pageParam),
        ...(cursor === undefined ? {} : { cursor }),
      });
    },
    getNextPageParam: nextHistoryCursor,
  });

  const entries = query.data?.pages.flatMap((page) => page.entries) ?? [];
  const first = query.data?.pages[0];
  const last = query.data?.pages[query.data.pages.length - 1];
  const total = first?.total ?? entries.length;
  const historyStartsAt = first?.historyStartsAt;
  const hasMore = last?.hasMore ?? false;

  return {
    ...query,
    entries,
    total,
    historyStartsAt,
    hasMore,
  };
};

export const useProjectFinishedPages = (projectId: string, enabled: boolean) => {
  const query = useInfiniteQuery({
    queryKey: ['tasks', 'project', projectId, 'finished'],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const cursor = historyCursor(pageParam);
      return projectClient.listOpenTasks({
        id: projectId,
        status: 'finished',
        limit: timelinePageLimit(pageParam),
        ...(cursor === undefined ? {} : { cursor }),
      });
    },
    getNextPageParam: nextHistoryCursor,
  });

  const items = query.data?.pages.flatMap((page) => page.tasks) ?? [];
  const first = query.data?.pages[0];
  const total = first?.total ?? items.length;

  return {
    ...query,
    items,
    total,
  };
};

export type LoadedHistoryPage = HistoryPage;
