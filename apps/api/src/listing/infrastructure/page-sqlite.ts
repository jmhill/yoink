import { ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import type { KeysetCursor } from '../domain/keyset-cursor.js';
import type { KeysetRows } from '../domain/listed-page.js';
import type { KeysetDirection } from '../domain/keyset-window.js';
import { sqlKeysetClause } from './sql-keyset.js';

export const pageSqlite = <T>(options: {
  db: Database;
  from: string;
  whereSql: string;
  whereArgs: (string | number)[];
  orderSql: string;
  keyColumns: readonly string[];
  direction: KeysetDirection;
  fetchLimit: number;
  seek?: KeysetCursor;
  mapRow: (row: Record<string, unknown>) => T;
  errorMessage: string;
}): ResultAsync<KeysetRows<T>, { readonly type: 'STORAGE_ERROR'; readonly message: string; readonly cause?: unknown }> => {
  const seekClause = options.seek
    ? sqlKeysetClause({
        columns: options.keyColumns,
        direction: options.direction,
        seek: options.seek,
      })
    : undefined;
  const selectWhere = seekClause
    ? `${options.whereSql} AND ${seekClause.sql}`
    : options.whereSql;
  const selectArgs = seekClause
    ? [...options.whereArgs, ...seekClause.args, options.fetchLimit]
    : [...options.whereArgs, options.fetchLimit];

  return ResultAsync.fromPromise(
    options.db.batch(
      [
        {
          sql: `SELECT COUNT(*) AS count FROM ${options.from} WHERE ${options.whereSql}`,
          args: options.whereArgs,
        },
        {
          sql: `SELECT * FROM ${options.from} WHERE ${selectWhere} ${options.orderSql} LIMIT ?`,
          args: selectArgs,
        },
      ],
      'read'
    ),
    (cause) => ({
      type: 'STORAGE_ERROR' as const,
      message: options.errorMessage,
      cause,
    })
  ).map(([countResult, pageResult]) => ({
    rows: (pageResult?.rows ?? []).map((row) => options.mapRow(row)),
    total: Number(countResult?.rows[0]?.count ?? 0),
  }));
};
