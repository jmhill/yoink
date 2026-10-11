import { HISTORY_PAGE_DEFAULT, type HistoryPage } from '@yoink/api-contracts';
import { tsrProjects, tsrTasks } from '@/api/client';

/** First page is small so the walkthrough can show Show more without 50 rows. */
export const PROJECT_HISTORY_PAGE_SIZE = 5;

const nextHistoryCursor = (lastPage: { status: number; body: { hasMore: boolean; nextCursor: string | null } }) => {
  if (lastPage.status !== 200 || lastPage.body.hasMore !== true) {
    return undefined;
  }
  return lastPage.body.nextCursor ?? undefined;
};

const historyCursor = (pageParam: unknown): string | undefined =>
  typeof pageParam === 'string' && pageParam.length > 0 ? pageParam : undefined;

export const useProjectHistoryPages = (projectId: string, enabled: boolean) => {
  const query = tsrProjects.listHistory.useInfiniteQuery({
    queryKey: ['projects', projectId, 'history'],
    enabled,
    initialPageParam: undefined,
    queryData: ({ pageParam }) => ({
      params: { id: projectId },
      query: {
        limit: PROJECT_HISTORY_PAGE_SIZE,
        cursor: historyCursor(pageParam),
      },
    }),
    getNextPageParam: nextHistoryCursor,
  });

  const entries =
    query.data?.pages.flatMap((page) =>
      page.status === 200 ? page.body.entries : []
    ) ?? [];
  const first = query.data?.pages[0];
  const last = query.data?.pages[query.data.pages.length - 1];
  const total = first?.status === 200 ? first.body.total : entries.length;
  const historyStartsAt =
    first?.status === 200 ? first.body.historyStartsAt : undefined;
  const hasMore = last?.status === 200 ? last.body.hasMore : false;

  return {
    ...query,
    entries,
    total,
    historyStartsAt,
    hasMore,
  };
};

export const useProjectFinishedPages = (projectId: string, enabled: boolean) => {
  const query = tsrProjects.listOpenTasks.useInfiniteQuery({
    queryKey: ['tasks', 'project', projectId, 'finished'],
    enabled,
    initialPageParam: undefined,
    queryData: ({ pageParam }) => ({
      params: { id: projectId },
      query: {
        status: 'finished' as const,
        limit: HISTORY_PAGE_DEFAULT,
        cursor: historyCursor(pageParam),
      },
    }),
    getNextPageParam: nextHistoryCursor,
  });

  const items =
    query.data?.pages.flatMap((page) =>
      page.status === 200 ? page.body.tasks : []
    ) ?? [];
  const first = query.data?.pages[0];
  const total = first?.status === 200 ? first.body.total : items.length;

  return {
    ...query,
    items,
    total,
  };
};

export type LoadedHistoryPage = {
  status: 200;
  body: HistoryPage;
};
