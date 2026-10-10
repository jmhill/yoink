import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { ChangeLogSubjectType } from '../domain/kinds.js';
import { parseChangeLogRecord } from '../domain/parse-record.js';
import type { ChangeLogRecord } from '../domain/record.js';
import type { ChangeLogStore, ListChangeLogError } from './sqlite-change-log-store.js';

export type FakeChangeLogStore = ChangeLogStore & {
  records: ChangeLogRecord[];
  insert: (record: ChangeLogRecord) => ResultAsync<void, ListChangeLogError>;
  captureSnapshot: () => () => void;
};

export type FakeChangeLogStoreOptions = {
  shouldFailOnInsert?: boolean;
  initialRecords?: ChangeLogRecord[];
};

export const createFakeChangeLogStore = (
  options: FakeChangeLogStoreOptions = {}
): FakeChangeLogStore => {
  const records: ChangeLogRecord[] = [...(options.initialRecords ?? [])];

  return {
    records,
    findBySubject: (
      subjectType: ChangeLogSubjectType,
      subjectId: string
    ): ResultAsync<ChangeLogRecord[], ListChangeLogError> => {
      const found = records.filter(
        (record) => record.subjectType === subjectType && record.subjectId === subjectId
      );
      const parsed: ChangeLogRecord[] = [];
      for (const record of found) {
        const result = parseChangeLogRecord(record);
        if (result.isErr()) {
          return errAsync(result.error);
        }
        parsed.push(result.value);
      }
      return okAsync(parsed);
    },
    insert: (record) => {
      if (options.shouldFailOnInsert) {
        return errAsync({
          type: 'STORAGE_ERROR',
          message: 'Change log insert failed',
        });
      }
      const parsed = parseChangeLogRecord(record);
      if (parsed.isErr()) {
        return errAsync(parsed.error);
      }
      records.push(parsed.value);
      return okAsync(undefined);
    },
    captureSnapshot: () => {
      const copy = structuredClone(records);
      return () => {
        records.length = 0;
        records.push(...copy);
      };
    },
  };
};
