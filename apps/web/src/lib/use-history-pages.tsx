import type { InfiniteData } from '@tanstack/react-query';
import { Button } from '@yoink/ui-base/components/button';
import {
  HISTORY_PAGE_DEFAULT,
  type Capture,
  type CaptureListPage,
  type Task,
  type TaskListPage,
} from '@yoink/api-contracts';
import { tsr, tsrTasks } from '@/api/client';

export const LOAD_MORE_TEST_ID = 'load-more';

export type TaskHistoryPage = {
  status: 200;
  body: TaskListPage;
};

export type CaptureHistoryPage = {
  status: 200;
  body: CaptureListPage;
};

export type TaskHistoryData = InfiniteData<TaskHistoryPage, string | undefined>;
export type CaptureHistoryData = InfiniteData<CaptureHistoryPage, string | undefined>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTaskListPage = (value: unknown): value is TaskListPage => {
  if (!isRecord(value) || !Array.isArray(value.tasks)) {
    return false;
  }
  return (
    typeof value.hasMore === 'boolean' &&
    (value.nextCursor === null || typeof value.nextCursor === 'string') &&
    typeof value.total === 'number'
  );
};

const isCaptureListPage = (value: unknown): value is CaptureListPage => {
  if (!isRecord(value) || !Array.isArray(value.captures)) {
    return false;
  }
  return (
    typeof value.hasMore === 'boolean' &&
    (value.nextCursor === null || typeof value.nextCursor === 'string') &&
    typeof value.total === 'number'
  );
};

export const isTaskHistoryData = (data: unknown): data is TaskHistoryData => {
  if (!isRecord(data) || !Array.isArray(data.pages) || !Array.isArray(data.pageParams)) {
    return false;
  }
  return data.pages.every(
    (page) => isRecord(page) && page.status === 200 && isTaskListPage(page.body)
  );
};

export const isCaptureHistoryData = (data: unknown): data is CaptureHistoryData => {
  if (!isRecord(data) || !Array.isArray(data.pages) || !Array.isArray(data.pageParams)) {
    return false;
  }
  return data.pages.every(
    (page) => isRecord(page) && page.status === 200 && isCaptureListPage(page.body)
  );
};

export const emptyCaptureHistoryPages = (): CaptureHistoryData => ({
  pages: [
    {
      status: 200,
      body: {
        captures: [],
        hasMore: false,
        nextCursor: null,
        total: 0,
      },
    },
  ],
  pageParams: [undefined],
});

export const mapTaskHistoryPageItems = (
  data: TaskHistoryData,
  mapItems: (items: Task[]) => Task[]
): TaskHistoryData => {
  let delta = 0;
  const pages = data.pages.map((page) => {
    const nextItems = mapItems(page.body.tasks);
    delta += nextItems.length - page.body.tasks.length;
    return {
      ...page,
      body: {
        ...page.body,
        tasks: nextItems,
      },
    };
  });
  const first = pages[0];
  if (delta !== 0 && first) {
    pages[0] = {
      ...first,
      body: {
        ...first.body,
        total: Math.max(0, first.body.total + delta),
      },
    };
  }
  return { ...data, pages };
};

export const mapCaptureHistoryPageItems = (
  data: CaptureHistoryData,
  mapItems: (items: Capture[]) => Capture[]
): CaptureHistoryData => {
  let delta = 0;
  const pages = data.pages.map((page) => {
    const nextItems = mapItems(page.body.captures);
    delta += nextItems.length - page.body.captures.length;
    return {
      ...page,
      body: {
        ...page.body,
        captures: nextItems,
      },
    };
  });
  const first = pages[0];
  if (delta !== 0 && first) {
    pages[0] = {
      ...first,
      body: {
        ...first.body,
        total: Math.max(0, first.body.total + delta),
      },
    };
  }
  return { ...data, pages };
};

export const prependCaptureHistoryPageItem = (
  data: CaptureHistoryData,
  item: Capture
): CaptureHistoryData => ({
  ...data,
  pages: data.pages.map((page, index) => {
    if (index !== 0) {
      return page;
    }
    return {
      ...page,
      body: {
        ...page.body,
        captures: [item, ...page.body.captures],
        total: page.body.total + 1,
      },
    };
  }),
});

const nextHistoryCursor = (lastPage: { status: number; body: { hasMore: boolean; nextCursor: string | null } }) => {
  if (lastPage.status !== 200 || lastPage.body.hasMore !== true) {
    return undefined;
  }
  return lastPage.body.nextCursor ?? undefined;
};

const historyCursor = (pageParam: unknown): string | undefined =>
  typeof pageParam === 'string' && pageParam.length > 0 ? pageParam : undefined;

/**
 * Paged history (Done). First-class pile reads do not use this —
 * those send one request up to the safety cap. Query keys stay under the
 * live-update collection prefixes so #125 cancel/invalidate still match.
 */
export const useCompletedTaskPages = (enabled: boolean) => {
  const query = tsrTasks.list.useInfiniteQuery({
    queryKey: ['tasks', 'completed'],
    enabled,
    initialPageParam: undefined,
    queryData: ({ pageParam }) => ({
      query: {
        filter: 'completed' as const,
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

/**
 * Paged history (Trash). Query keys stay under the live-update collection
 * prefixes so #125 cancel/invalidate still match.
 */
export const useTrashedCapturePages = (enabled: boolean) => {
  const query = tsr.list.useInfiniteQuery({
    queryKey: ['captures', 'trashed'],
    enabled,
    initialPageParam: undefined,
    queryData: ({ pageParam }) => ({
      query: {
        status: 'trashed' as const,
        limit: HISTORY_PAGE_DEFAULT,
        cursor: historyCursor(pageParam),
      },
    }),
    getNextPageParam: nextHistoryCursor,
  });

  const items =
    query.data?.pages.flatMap((page) =>
      page.status === 200 ? page.body.captures : []
    ) ?? [];
  const first = query.data?.pages[0];
  const total = first?.status === 200 ? first.body.total : items.length;

  return {
    ...query,
    items,
    total,
  };
};

export function LoadMoreButton(props: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  if (!props.hasNextPage) {
    return null;
  }

  return (
    <div className="mt-4 flex justify-center">
      <Button
        type="button"
        variant="outline"
        data-testid={LOAD_MORE_TEST_ID}
        data-load-more=""
        onClick={() => props.onLoadMore()}
        disabled={props.isFetchingNextPage}
      >
        {props.isFetchingNextPage ? 'Loading...' : 'Load more'}
      </Button>
    </div>
  );
}
