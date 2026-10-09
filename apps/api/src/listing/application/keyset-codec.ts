import { err, type Result } from 'neverthrow';
import { invalidCursorError, type InvalidCursorError } from '../domain/invalid-cursor.js';
import {
  listedCursorPayload,
  parseListedCursor,
  type CursorView,
  type KeysetCursor,
} from '../domain/keyset-cursor.js';

export const encodeKeysetCursor = (cursor: KeysetCursor): string =>
  Buffer.from(JSON.stringify(listedCursorPayload(cursor)), 'utf8').toString('base64url');

export const decodeKeysetCursor = (
  raw: string,
  expectedView: CursorView
): Result<KeysetCursor, InvalidCursorError> => {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return parseListedCursor(parsed, expectedView);
  } catch {
    return err(invalidCursorError());
  }
};
