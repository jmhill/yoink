import { err, ok, type Result } from 'neverthrow';
import {
  changeLogRecordSchema,
  type ChangeLogParseError,
  type ChangeLogRecord,
} from './record.js';

export const changeLogParseError = (message: string): ChangeLogParseError => ({
  type: 'CHANGE_LOG_PARSE_ERROR',
  message,
});

export const parseChangeLogRecord = (
  raw: unknown
): Result<ChangeLogRecord, ChangeLogParseError> => {
  const parsed = changeLogRecordSchema.safeParse(raw);
  if (!parsed.success) {
    return err(changeLogParseError('Change log record did not match schema'));
  }
  return ok(parsed.data);
};
