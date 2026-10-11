import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { ChangeLogSubjectType } from '../domain/kinds.js';
import { parseChangeLogRecord } from '../domain/parse-record.js';
import type { ChangeLogRecord } from '../domain/record.js';
import { isHiddenChangeLogKind } from '../domain/kinds.js';
import { taskUpdatedShowsOnTimeline } from '../domain/to-timeline-entry.js';
import {
  compareKeyset,
  pageOrdered,
} from '../../../listing/domain/keyset-window.js';
import {
  projectHistoryDirection,
  projectHistoryKeys,
  taskHistoryDirection,
  taskHistoryKeys,
} from '../../../listing/domain/list-keys.js';
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
    pageVisibleForProject: (options) => {
      const visible = records
        .filter((record) => record.organizationId === options.organizationId)
        .filter((record) => record.projectId === options.projectId)
        .filter((record) => !isHiddenChangeLogKind(record.kind))
        .filter((record) =>
          record.kind === 'TaskUpdated' ? taskUpdatedShowsOnTimeline(record.payload) : true
        )
        .map((record) => ({
          occurredAt: record.occurredAt,
          seq: records.indexOf(record) + 1,
          record,
        }))
        .sort((a, b) => {
          const cmp = compareKeyset(projectHistoryKeys(a), projectHistoryKeys(b));
          return -cmp;
        });
      return okAsync(
        pageOrdered({
          ordered: visible,
          keysOf: projectHistoryKeys,
          direction: projectHistoryDirection,
          fetchLimit: options.fetchLimit,
          seek: options.seek,
        })
      );
    },

    pageVisibleForTask: (options) => {
      const visible = records
        .filter((record) => record.organizationId === options.organizationId)
        .filter((record) => record.subjectType === 'task')
        .filter((record) => record.subjectId === options.subjectId)
        .filter((record) => !isHiddenChangeLogKind(record.kind))
        .filter((record) =>
          record.kind === 'TaskUpdated' ? taskUpdatedShowsOnTimeline(record.payload) : true
        )
        .map((record) => ({
          occurredAt: record.occurredAt,
          seq: records.indexOf(record) + 1,
          record,
        }))
        .sort((a, b) => {
          const cmp = compareKeyset(taskHistoryKeys(a), taskHistoryKeys(b));
          return -cmp;
        });
      return okAsync(
        pageOrdered({
          ordered: visible,
          keysOf: taskHistoryKeys,
          direction: taskHistoryDirection,
          fetchLimit: options.fetchLimit,
          seek: options.seek,
        })
      );
    },

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
