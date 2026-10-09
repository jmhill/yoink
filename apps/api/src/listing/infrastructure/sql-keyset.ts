import type { KeysetCursor, KeysetValue } from '../domain/keyset-cursor.js';
import type { KeysetDirection } from '../domain/keyset-window.js';

export const sqlKeysetClause = (options: {
  columns: readonly string[];
  direction: KeysetDirection;
  seek: KeysetCursor;
}): { sql: string; args: (string | number)[] } => {
  const op = options.direction === 'asc' ? '>' : '<';
  const terms: string[] = [];
  const args: (string | number)[] = [];

  for (let index = 0; index < options.columns.length; index++) {
    const equalities: string[] = [];
    for (let prefix = 0; prefix < index; prefix++) {
      equalities.push(`${options.columns[prefix]} = ?`);
      const value = options.seek.keys[prefix];
      args.push(value === null ? '' : value);
    }
    const column = options.columns[index];
    if (column === undefined) {
      continue;
    }
    equalities.push(`${column} ${op} ?`);
    const value = options.seek.keys[index];
    args.push(value === null ? '' : value);
    terms.push(`(${equalities.join(' AND ')})`);
  }

  return {
    sql: terms.length === 0 ? '1=1' : `(${terms.join(' OR ')})`,
    args,
  };
};
