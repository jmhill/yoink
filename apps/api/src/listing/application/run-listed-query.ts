import { errAsync, ok, type Result, type ResultAsync } from 'neverthrow';
import type { InvalidCursorError } from '../domain/invalid-cursor.js';
import type { AnyListedCursor, KeysetCursor } from '../domain/keyset-cursor.js';
import {
  assembleListedPage,
  type KeysetRows,
  type ListedPage,
} from '../domain/listed-page.js';
import { decodeKeysetCursor, encodeKeysetCursor } from './keyset-codec.js';

export const runListedQuery = <T, E>(options: {
  cursor?: string;
  cursorOf: AnyListedCursor<T>;
  limit: number;
  load: (
    seek: KeysetCursor | undefined,
    fetchLimit: number
  ) => ResultAsync<KeysetRows<T>, E>;
}): ResultAsync<ListedPage<T>, E | InvalidCursorError> => {
  const seekResult: Result<KeysetCursor | undefined, InvalidCursorError> =
    options.cursor === undefined
      ? ok(undefined)
      : decodeKeysetCursor(options.cursor, options.cursorOf.view);

  return seekResult.match(
    (seek) =>
      options.load(seek, options.limit + 1).map((page) => {
        const assembled = assembleListedPage({
          rows: page.rows,
          total: page.total,
          limit: options.limit,
          cursorOf: options.cursorOf.of,
        });
        return {
          items: assembled.items,
          hasMore: assembled.hasMore,
          nextCursor: assembled.next ? encodeKeysetCursor(assembled.next) : null,
          total: assembled.total,
        };
      }),
    (error) => errAsync(error)
  );
};
