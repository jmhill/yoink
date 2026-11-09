import { err, ok, type Result } from 'neverthrow';
import {
  storageFailure,
  type FakeParticipant,
  type StepFailure,
} from '../../../kernel/unit-of-work.js';
import { changeLogRecordSchema, type ChangeLogRecord } from '../domain/record.js';

export type FakeHistoryParticipant = FakeParticipant<unknown> & {
  readonly records: () => readonly ChangeLogRecord[];
};

const planRejected = (): Result<void, StepFailure> =>
  err(storageFailure(['history'], 'plan-rejected'));

/** In-memory sink store. Snapshot restores the record list. */
export const createFakeHistoryParticipant = (): FakeHistoryParticipant => {
  let records: readonly ChangeLogRecord[] = [];

  return {
    owner: 'history',
    records: () => records,
    snapshot: () => {
      const saved = records;
      return () => {
        records = saved;
      };
    },
    apply: (plan) => {
      const parsed = changeLogRecordSchema.array().safeParse(plan);
      if (!parsed.success) {
        return planRejected();
      }
      records = [...records, ...parsed.data];
      return ok(undefined);
    },
  };
};
