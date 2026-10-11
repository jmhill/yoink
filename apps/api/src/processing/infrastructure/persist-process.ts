import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import { insertChangeLogQuery } from '../../shared/change-log/infrastructure/sql.js';
import type { FakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import {
  captureNotInInboxError,
  storageError as captureStorageError,
  type CaptureNotInInboxError,
  type StorageError as CaptureStorageError,
} from '../../captures/domain/capture-errors.js';
import {
  duplicateProjectNameError,
  storageError as projectStorageError,
  type DuplicateProjectNameError,
  type StorageError as ProjectStorageError,
} from '../../projects/domain/project-errors.js';
import type { FakeProjectStore } from '../../projects/infrastructure/fake-project-store.js';
import type { FakeTaskStore } from '../../tasks/infrastructure/fake-task-store.js';
import type { FakeCaptureStore } from '../../captures/infrastructure/fake-capture-store.js';
import type {
  PersistProcessToProject,
  PersistProcessToTask,
  ProcessCaptureMark,
} from '../application/ports.js';
import {
  insertProjectIfCaptureInInboxQuery,
  insertTaskIfCaptureInInboxQuery,
  markCaptureProcessedIfInboxQuery,
} from './process-row-statements.js';

const uniqueNameConstraintFailed = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /idx_projects_org_name_ci/i.test(message);
};

const persistRecords = (
  changeLog: FakeChangeLogStore,
  records: readonly ChangeLogRecord[]
): ResultAsync<void, CaptureStorageError> =>
  records.reduce(
    (chain, record) =>
      chain.andThen(() =>
        changeLog.insert(record).mapErr((error) => captureStorageError(error.message))
      ),
    okAsync<void, CaptureStorageError>(undefined)
  );

export const createSqliteProcessToProjectPersist = (deps: {
  db: Database;
}): PersistProcessToProject => {
  return (input) => {
    const queries = [
      insertProjectIfCaptureInInboxQuery(input.project.view, input.capture.id),
      ...input.project.records.map((record) => insertChangeLogQuery(record)),
      markCaptureProcessedIfInboxQuery(input.capture),
    ];

    return ResultAsync.fromPromise(
      deps.db.batch(queries, 'write'),
      (error): ProjectStorageError | DuplicateProjectNameError => {
        if (uniqueNameConstraintFailed(error)) {
          return duplicateProjectNameError(input.project.view.name);
        }
        return projectStorageError('Failed to process capture to project', error);
      }
    ).andThen((results) => {
      const marked = results[queries.length - 1];
      if ((marked?.rowsAffected ?? 0) === 0) {
        return errAsync(captureNotInInboxError(input.capture.id));
      }
      return okAsync(undefined);
    });
  };
};

export const createSqliteProcessToTaskPersist = (deps: {
  db: Database;
}): PersistProcessToTask => {
  return (input) => {
    const queries = [
      insertTaskIfCaptureInInboxQuery(input.task.view, input.capture.id),
      ...input.task.records.map((record) => insertChangeLogQuery(record)),
      markCaptureProcessedIfInboxQuery(input.capture),
    ];

    return ResultAsync.fromPromise(
      deps.db.batch(queries, 'write'),
      (error) => captureStorageError('Failed to process capture to task', error)
    ).andThen((results) => {
      const marked = results[queries.length - 1];
      if ((marked?.rowsAffected ?? 0) === 0) {
        return errAsync(captureNotInInboxError(input.capture.id));
      }
      return okAsync(undefined);
    });
  };
};

const markOnFake = (
  captures: FakeCaptureStore,
  capture: ProcessCaptureMark
): ResultAsync<void, CaptureStorageError | CaptureNotInInboxError> =>
  captures
    .markAsProcessed({
      id: capture.id,
      processedAt: capture.processedAt,
      processedToType: capture.processedToType,
      processedToId: capture.processedToId,
      requiredStatus: 'inbox',
    })
    .map(() => undefined);

export const createFakeProcessToProjectPersist = (deps: {
  projects: FakeProjectStore;
  captures: FakeCaptureStore;
  changeLog: FakeChangeLogStore;
}): PersistProcessToProject => {
  return (input) => {
    const restoreProject = deps.projects.captureSnapshot();
    const restoreCaptures = deps.captures.captureSnapshot();
    const restoreLog = deps.changeLog.captureSnapshot();

    return deps.captures.findById(input.capture.id).andThen((current) => {
      if (!current || current.status !== 'inbox') {
        return errAsync(captureNotInInboxError(input.capture.id));
      }

      deps.projects.applyInsert(input.project.view);
      return persistRecords(deps.changeLog, input.project.records)
        .andThen(() => markOnFake(deps.captures, input.capture))
        .mapErr((error) => {
          restoreProject();
          restoreCaptures();
          restoreLog();
          return error;
        });
    });
  };
};

export const createFakeProcessToTaskPersist = (deps: {
  tasks: FakeTaskStore;
  captures: FakeCaptureStore;
  changeLog: FakeChangeLogStore;
}): PersistProcessToTask => {
  return (input) => {
    const restoreTasks = deps.tasks.captureSnapshot();
    const restoreCaptures = deps.captures.captureSnapshot();
    const restoreLog = deps.changeLog.captureSnapshot();

    return deps.captures.findById(input.capture.id).andThen((current) => {
      if (!current || current.status !== 'inbox') {
        return errAsync(captureNotInInboxError(input.capture.id));
      }

      deps.tasks.applyInsert(input.task.view);
      return persistRecords(deps.changeLog, input.task.records)
        .andThen(() => markOnFake(deps.captures, input.capture))
        .mapErr((error) => {
          restoreTasks();
          restoreCaptures();
          restoreLog();
          return error;
        });
    });
  };
};
