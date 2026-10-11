import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import {
  importNotFoundError,
  importNotPendingError,
  storageError,
  type ImportNotPendingError,
  type StorageError,
} from '../domain/project-errors.js';
import type { ProjectImportRecord } from '../domain/project-import.js';

export type FakeImportStore = {
  records: ProjectImportRecord[];
  captureSnapshot: () => () => void;
  insert: (record: ProjectImportRecord) => ResultAsync<void, StorageError>;
  findById: (id: string) => ResultAsync<ProjectImportRecord | null, StorageError>;
  listPending: (organizationId: string) => ResultAsync<ProjectImportRecord[], StorageError>;
  markDecided: (input: {
    id: string;
    status: 'applied' | 'discarded';
    decidedById: string;
    decidedAt: string;
  }) => ResultAsync<void, StorageError | ImportNotPendingError>;
};

export const createFakeImportStore = (
  initial: ProjectImportRecord[] = []
): FakeImportStore => {
  const records: ProjectImportRecord[] = [...initial];

  return {
    records,
    captureSnapshot: () => {
      const copy = records.map((record) => ({
        ...record,
        projects: record.projects.map((project) => ({ ...project })),
      }));
      return () => {
        records.length = 0;
        records.push(...copy);
      };
    },
    insert: (record) => {
      records.push(record);
      return okAsync(undefined);
    },
    findById: (id) => okAsync(records.find((record) => record.id === id) ?? null),
    listPending: (organizationId) =>
      okAsync(
        records.filter(
          (record) => record.organizationId === organizationId && record.status === 'pending'
        )
      ),
    markDecided: (input) => {
      const index = records.findIndex((record) => record.id === input.id);
      const current = index === -1 ? undefined : records[index];
      if (!current) {
        return errAsync(storageError(importNotFoundError(input.id).message));
      }
      if (current.status !== 'pending') {
        return errAsync(importNotPendingError());
      }
      records[index] = {
        ...current,
        status: input.status,
        decidedById: input.decidedById,
        decidedAt: input.decidedAt,
      };
      return okAsync(undefined);
    },
  };
};
