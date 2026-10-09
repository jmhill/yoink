import type { KeysetCursor } from './keyset-cursor.js';

export type ListedPage<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};

export type KeysetRows<T> = {
  rows: T[];
  total: number;
};

export type AssembledPage<T> = {
  items: T[];
  hasMore: boolean;
  next: KeysetCursor | null;
  total: number;
};

export const assembleListedPage = <T>(options: {
  rows: readonly T[];
  total: number;
  limit: number;
  cursorOf: (item: T) => KeysetCursor;
}): AssembledPage<T> => {
  const hasMore = options.rows.length > options.limit;
  const items = options.rows.slice(0, options.limit);
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    next: hasMore && last ? options.cursorOf(last) : null,
    total: options.total,
  };
};
