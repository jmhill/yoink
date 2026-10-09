export type ListedPage<T extends { id: string }> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

export type PageListedItemsOptions = {
  limit?: number;
  cursor?: string;
};

/**
 * Page a stably ordered list. Cursor is the last item id from the previous
 * page. Unknown cursors yield an empty remainder so we never silently rewind
 * and duplicate.
 */
export const pageListedItems = <T extends { id: string }>(
  ordered: readonly T[],
  options: PageListedItemsOptions = {}
): ListedPage<T> => {
  const total = ordered.length;
  const limit = options.limit ?? total;
  let start = 0;
  if (options.cursor !== undefined) {
    const cursorIndex = ordered.findIndex((item) => item.id === options.cursor);
    start = cursorIndex === -1 ? total : cursorIndex + 1;
  }
  const items = ordered.slice(start, start + limit);
  const hasMore = start + items.length < total;
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? last.id : null,
    total,
  };
};
