import type { KeysetCursor, KeysetValue } from '../domain/keyset-cursor.js';
import type { KeysetDirection } from '../domain/keyset-window.js';

const asSqlArg = (value: KeysetValue | undefined): KeysetValue | undefined => {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  return undefined;
};

export const sqlKeysetClause = (options: {
  columns: readonly string[];
  direction: KeysetDirection;
  seek: KeysetCursor;
}): { sql: string; args: KeysetValue[] } => {
  const op = options.direction === 'asc' ? '>' : '<';
  const terms: string[] = [];
  const args: KeysetValue[] = [];

  for (let index = 0; index < options.columns.length; index++) {
    const equalities: string[] = [];
    let complete = true;
    for (let prefix = 0; prefix < index; prefix++) {
      const prefixValue = asSqlArg(options.seek.keys[prefix]);
      const prefixColumn = options.columns[prefix];
      if (prefixValue === undefined || prefixColumn === undefined) {
        complete = false;
        break;
      }
      equalities.push(`${prefixColumn} = ?`);
      args.push(prefixValue);
    }
    const column = options.columns[index];
    const value = asSqlArg(options.seek.keys[index]);
    if (!complete || column === undefined || value === undefined) {
      continue;
    }
    equalities.push(`${column} ${op} ?`);
    args.push(value);
    terms.push(`(${equalities.join(' AND ')})`);
  }

  return {
    sql: terms.length === 0 ? '1=1' : `(${terms.join(' OR ')})`,
    args,
  };
};
