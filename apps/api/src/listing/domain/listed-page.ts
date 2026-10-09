import { errAsync, ok, type Result, type ResultAsync } from 'neverthrow';
import { decodeKeysetCursor, encodeKeysetCursor, type KeysetCursor } from './keyset-cursor.js';
import type { InvalidCursorError } from './invalid-cursor.js';

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

export const assembleListedPage = <T>(options: {
  rows: readonly T[];
  total: number;
  limit: number;
  cursorOf: (item: T) => KeysetCursor;
}): ListedPage<T> => {
  const hasMore = options.rows.length > options.limit;
  const items = options.rows.slice(0, options.limit);
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeKeysetCursor(options.cursorOf(last)) : null,
    total: options.total,
  };
};

export const runListedQuery = <T, E>(options: {
  cursor?: string;
  limit: number;
  cursorOf: (item: T) => KeysetCursor;
  load: (
    seek: KeysetCursor | undefined,
    fetchLimit: number
  ) => ResultAsync<KeysetRows<T>, E>;
}): ResultAsync<ListedPage<T>, E | InvalidCursorError> => {
  const seekResult: Result<KeysetCursor | undefined, InvalidCursorError> =
    options.cursor === undefined ? ok(undefined) : decodeKeysetCursor(options.cursor);

  return seekResult.match(
    (seek) =>
      options.load(seek, options.limit + 1).map((page) =>
        assembleListedPage({
          rows: page.rows,
          total: page.total,
          limit: options.limit,
          cursorOf: options.cursorOf,
        })
      ),
    (error) => errAsync(error)
  );
};
