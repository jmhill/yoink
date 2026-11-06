import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { Button } from '@yoink/ui-base/components/button';
import {
  HISTORY_PAGE_DEFAULT,
  type Capture,
  type CaptureListPage,
  type Task,
  type TaskListPage,
} from '@yoink/api-contracts';
import { captureClient, taskClient } from '@/api/client';

export const LOAD_MORE_TEST_ID = 'load-more';

export type TaskHistoryPage = TaskListPage;

export type CaptureHistoryPage = CaptureListPage;

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
  return data.pages.every((page) => isTaskListPage(page));
};

export const isCaptureHistoryData = (data: unknown): data is CaptureHistoryData => {
  if (!isRecord(data) || !Array.isArray(data.pages) || !Array.isArray(data.pageParams)) {
    return false;
  }
  return data.pages.every((page) => isCaptureListPage(page));
};

export const emptyCaptureHistoryPages = (): CaptureHistoryData => ({
  pages: [
    {
      captures: [],
      hasMore: false,
      nextCursor: null,
      total: 0,
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
    const nextItems = mapItems(page.tasks);
    delta += nextItems.length - page.tasks.length;
    return {
      ...page,
      tasks: nextItems,
    };
  });
  const first = pages[0];
  if (delta !== 0 && first) {
    pages[0] = {
      ...first,
      total: Math.max(0, first.total + delta),
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
    const nextItems = mapItems(page.captures);
    delta += nextItems.length - page.captures.length;
    return {
      ...page,
      captures: nextItems,
    };
  });
  const first = pages[0];
  if (delta !== 0 && first) {
    pages[0] = {
      ...first,
      total: Math.max(0, first.total + delta),
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
      captures: [item, ...page.captures],
      total: page.total + 1,
    };
  }),
});

const nextHistoryCursor = (lastPage: { hasMore: boolean; nextCursor: string | null }) => {
  if (lastPage.hasMore !== true) {
    return undefined;
  }
  return lastPage.nextCursor ?? undefined;
};

const historyCursor = (pageParam: unknown): string | undefined =>
  typeof pageParam === 'string' && pageParam.length > 0 ? pageParam : undefined;

/**
 * Paged history (Done). First-class pile reads do not use this —
 * those send one request up to the safety cap. Query keys stay under the
 * live-update collection prefixes so #125 cancel/invalidate still match.
 */
export const useCompletedTaskPages = (enabled: boolean) => {
  const query = useInfiniteQuery({
    queryKey: ['tasks', 'completed'],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const cursor = historyCursor(pageParam);
      return taskClient.list({
        filter: 'completed',
        limit: HISTORY_PAGE_DEFAULT,
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

/**
 * Paged history (Trash). Query keys stay under the live-update collection
 * prefixes so #125 cancel/invalidate still match.
 */
export const useTrashedCapturePages = (enabled: boolean) => {
  const query = useInfiniteQuery({
    queryKey: ['captures', 'trashed'],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const cursor = historyCursor(pageParam);
      return captureClient.list({
        status: 'trashed',
        limit: HISTORY_PAGE_DEFAULT,
        ...(cursor === undefined ? {} : { cursor }),
      });
    },
    getNextPageParam: nextHistoryCursor,
  });

  const items = query.data?.pages.flatMap((page) => page.captures) ?? [];
  const first = query.data?.pages[0];
  const total = first?.total ?? items.length;

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
