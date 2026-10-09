import type { KeysetCursor, KeysetValue } from './keyset-cursor.js';

export type KeysetDirection = 'asc' | 'desc';

export const compareBinary = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

export const compareKeysetValue = (left: KeysetValue, right: KeysetValue): number => {
  if (left === right) {
    return 0;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return compareBinary(String(left), String(right));
};

export const compareKeyset = (
  left: readonly KeysetValue[],
  right: readonly KeysetValue[]
): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined || rightValue === undefined) {
      break;
    }
    const cmp = compareKeysetValue(leftValue, rightValue);
    if (cmp !== 0) {
      return cmp;
    }
  }
  return left.length - right.length;
};

export const pageOrdered = <T>(options: {
  ordered: readonly T[];
  keysOf: (item: T) => readonly KeysetValue[];
  direction: KeysetDirection;
  fetchLimit: number;
  seek?: KeysetCursor;
}): { rows: T[]; total: number } => ({
  rows: applyKeysetWindow(options),
  total: options.ordered.length,
});

export const applyKeysetWindow = <T>(options: {
  ordered: readonly T[];
  keysOf: (item: T) => readonly KeysetValue[];
  direction: KeysetDirection;
  fetchLimit: number;
  seek?: KeysetCursor;
}): T[] => {
  const start = options.seek
    ? options.ordered.findIndex((item) => {
        const cmp = compareKeyset(options.keysOf(item), options.seek?.keys ?? []);
        return options.direction === 'asc' ? cmp > 0 : cmp < 0;
      })
    : 0;
  if (start === -1) {
    return [];
  }
  return options.ordered.slice(start, start + options.fetchLimit);
};
