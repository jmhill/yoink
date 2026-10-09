import { err, ok, type Result } from 'neverthrow';
import { invalidCursorError, type InvalidCursorError } from './invalid-cursor.js';

export type KeysetValue = string | number | null;

export type KeysetCursor = {
  keys: readonly KeysetValue[];
};

const isKeysetValue = (value: unknown): value is KeysetValue =>
  value === null || typeof value === 'string' || typeof value === 'number';

const isKeysetPayload = (value: unknown): value is { k: KeysetValue[] } => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('k' in value) || !Array.isArray(value.k) || value.k.length === 0) {
    return false;
  }
  return value.k.every(isKeysetValue);
};

export const encodeKeysetCursor = (cursor: KeysetCursor): string =>
  Buffer.from(JSON.stringify({ k: cursor.keys }), 'utf8').toString('base64url');

export const decodeKeysetCursor = (
  raw: string
): Result<KeysetCursor, InvalidCursorError> => {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (!isKeysetPayload(parsed)) {
      return err(invalidCursorError());
    }
    return ok({ keys: parsed.k });
  } catch {
    return err(invalidCursorError());
  }
};
