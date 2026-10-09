import { useInfiniteQuery } from '@tanstack/react-query';
import { Button } from '@yoink/ui-base/components/button';
import { HISTORY_PAGE_DEFAULT } from '@yoink/api-contracts';
import { tokenStorage } from '@/lib/token';

export const LOAD_MORE_TEST_ID = 'load-more';

type HistoryPageMeta = {
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

type HistoryPageBody<K extends string, T> = HistoryPageMeta & {
  [key in K]: T[];
};

export type HistoryPagesData<K extends string, T> = {
  pages: Array<{
    status: number;
    body: HistoryPageBody<K, T>;
  }>;
  pageParams: unknown[];
};

type AnyHistoryPagesData = {
  pages: Array<{
    status: number;
    body: HistoryPageMeta & Record<string, unknown>;
  }>;
  pageParams: unknown[];
};

export const emptyHistoryPages = <K extends string>(
  itemKey: K
): HistoryPagesData<K, never> => ({
  pages: [
    {
      status: 200,
      body: {
        [itemKey]: [],
        hasMore: false,
        nextCursor: null,
        total: 0,
      } as HistoryPageBody<K, never>,
    },
  ],
  pageParams: [undefined],
});

export const isHistoryPagesData = (data: unknown): data is AnyHistoryPagesData => {
  if (typeof data !== 'object' || data === null || !('pages' in data)) {
    return false;
  }
  return Array.isArray((data as AnyHistoryPagesData).pages);
};

export const mapHistoryPageItems = <K extends string, T>(
  data: unknown,
  itemKey: K,
  mapItems: (items: T[]) => T[]
): unknown => {
  if (!isHistoryPagesData(data)) {
    return data;
  }
  let delta = 0;
  const pages = data.pages.map((page) => {
    if (page.status !== 200) {
      return page;
    }
    const items = (page.body[itemKey] as T[] | undefined) ?? [];
    const nextItems = mapItems(items);
    delta += nextItems.length - items.length;
    return {
      ...page,
      body: {
        ...page.body,
        [itemKey]: nextItems,
      },
    };
  });
  const first = pages[0];
  if (delta !== 0 && first?.status === 200) {
    pages[0] = {
      ...first,
      body: {
        ...first.body,
        total: Math.max(0, first.body.total + delta),
      },
    };
  }
  return {
    ...data,
    pages,
  };
};

export const prependHistoryPageItem = <K extends string, T>(
  data: unknown,
  itemKey: K,
  item: T
): unknown => {
  if (!isHistoryPagesData(data)) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page, index) => {
      if (index !== 0 || page.status !== 200) {
        return page;
      }
      const items = (page.body[itemKey] as T[] | undefined) ?? [];
      return {
        ...page,
        body: {
          ...page.body,
          [itemKey]: [item, ...items],
          total: page.body.total + 1,
        },
      };
    }),
  };
};

type HistoryPage<K extends string, T> = {
  status: number;
  body: HistoryPageBody<K, T>;
};

/**
 * Paged history (Done, Trash). First-class pile reads do not use this —
 * those send one request up to the safety cap. Query keys stay under the
 * live-update collection prefixes so #125 cancel/invalidate still match.
 */
export const useHistoryPages = <K extends string, T>(options: {
  queryKey: readonly unknown[];
  path: string;
  itemKey: K;
  search: Record<string, string>;
  enabled: boolean;
}) => {
  const query = useInfiniteQuery({
    queryKey: [...options.queryKey],
    enabled: options.enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<HistoryPage<K, T>> => {
      const params = new URLSearchParams({
        ...options.search,
        limit: String(HISTORY_PAGE_DEFAULT),
      });
      if (pageParam) {
        params.set('cursor', pageParam);
      }
      const headers = new Headers();
      const token = tokenStorage.get();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const response = await fetch(`${options.path}?${params.toString()}`, {
        credentials: 'include',
        headers,
      });
      const body = (await response.json()) as HistoryPageBody<K, T>;
      return { status: response.status, body };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.status !== 200 || !lastPage.body.hasMore) {
        return undefined;
      }
      return lastPage.body.nextCursor ?? undefined;
    },
  });

  const items =
    query.data?.pages.flatMap((page) =>
      page.status === 200 ? page.body[options.itemKey] : []
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
