import { type ResultAsync } from 'neverthrow';
import type { CommitFailure, UnitOfWork, Work } from '../../../../kernel/unit-of-work.js';
import { timelineEvent } from '../integration-events/timeline-event.js';
import type { ChangeLogRecord } from '../../../history/domain/record.js';
import type { ListChangePlan } from '../../domain/projections/plan-list-change.js';
import type { ProjectChangePlan } from '../../domain/projections/plan-project-change.js';
import type { TaskChangePlan } from '../../domain/projections/plan-task-change.js';
import type { TaskManagementStep } from '../../domain/projections/task-management-step.js';
import {
  duplicateProjectNameError,
  importNotPendingError,
  projectDoneError,
  storageError,
  type DuplicateProjectNameError,
  type ImportNotPendingError,
  type ProjectDoneError,
  type StorageError,
} from '../../domain/messages/project-errors.js';
import {
  storageError as taskStorageError,
  taskNotFoundError,
  type TaskNotFoundError,
} from '../../domain/messages/task-errors.js';
import type {
  PersistImportApply,
  PersistImportDiscard,
  PersistNamedListChange,
  PersistProjectChange,
  PersistSetNextAction,
  PersistTaskChange,
} from '../ports.js';

const eventsOf = (records: readonly ChangeLogRecord[]) => records.map((record) => timelineEvent(record));

const work = (step: TaskManagementStep, records: readonly ChangeLogRecord[]): Work<undefined> => ({
  result: undefined,
  events: eventsOf(records),
  step: { owner: 'task-management', plan: step },
});

const projectRecords = (plan: ProjectChangePlan): readonly ChangeLogRecord[] =>
  plan.action === 'clearNextAction' ? [] : plan.records;

const commit = (uow: UnitOfWork, works: readonly Work<unknown>[]): ResultAsync<void, CommitFailure> =>
  uow.commit(works);

const taskIdOf = (plan: TaskChangePlan): string =>
  plan.action === 'delete' ? plan.taskId : plan.view.id;

export const taskWork = (
  plan: TaskChangePlan,
  options?: { readonly whenProjectExists?: boolean }
): Work<undefined> =>
  work(
    { type: 'task', plan, ...(options?.whenProjectExists ? { whenProjectExists: true } : {}) },
    plan.records
  );

export const projectWork = (plan: ProjectChangePlan): Work<undefined> =>
  work({ type: 'project', plan }, projectRecords(plan));

const taskCommitWork = (plan: TaskChangePlan, inlineHistory: boolean): Work<undefined> =>
  inlineHistory
    ? {
        result: undefined,
        events: plan.records.map((record) => timelineEvent(record, { inline: true })),
        step: { owner: 'task-management', plan: { type: 'task', plan, inlineHistory: true } },
      }
    : taskWork(plan);

export const createUowTaskPersist =
  (uow: UnitOfWork): PersistTaskChange =>
  (plan, extras) =>
    commit(uow, [
      taskCommitWork(plan, extras?.project?.action === 'clearNextAction'),
      ...(extras?.project ? [projectWork(extras.project)] : []),
    ]).mapErr((failure): StorageError | TaskNotFoundError => {
      if (failure.kind === 'Conflict' && failure.reason === 'task-missing') {
        return taskNotFoundError(taskIdOf(plan));
      }
      return taskStorageError('Failed to persist task change', failure);
    });

export const createUowProjectPersist =
  (uow: UnitOfWork): PersistProjectChange =>
  (plan) =>
    commit(uow, [projectWork(plan)]).mapErr((failure): StorageError | DuplicateProjectNameError => {
      if (failure.kind === 'Conflict' && failure.reason === 'duplicate-name') {
        return duplicateProjectNameError(plan.view.name);
      }
      return storageError('Failed to persist project change', failure);
    });

export const createUowProjectStatusPersist =
  (uow: UnitOfWork): PersistSetNextAction =>
  (input) =>
    commit(uow, [...input.tasks.map((plan) => taskWork(plan)), projectWork(input.project)]).mapErr(
      (failure): StorageError | ProjectDoneError => {
        if (
          failure.kind === 'Conflict' &&
          failure.reason === 'project-done' &&
          input.project.action === 'setNextAction'
        ) {
          return projectDoneError(input.project.projectId);
        }
        return storageError('Failed to persist project status change', failure);
      }
    );

export const createUowListPersist =
  (uow: UnitOfWork): PersistNamedListChange =>
  (plan: ListChangePlan) =>
    commit(uow, [work({ type: 'list', plan }, plan.records)]).mapErr((failure) =>
      storageError('Failed to persist list change', failure)
    );

export const createUowImportPersist =
  (uow: UnitOfWork): PersistImportApply =>
  (input) =>
    commit(uow, [
      work(
        {
          type: 'import-apply',
          write: input.write,
          stagedImportId: input.stagedImportId,
          decidedById: input.decidedById,
          decidedAt: input.decidedAt,
        },
        [...input.write.importRecords, ...input.write.tasks.flatMap((plan) => plan.records)]
      ),
    ]).mapErr((failure): StorageError | DuplicateProjectNameError | ImportNotPendingError => {
      if (failure.kind === 'Conflict' && failure.reason === 'duplicate-name') {
        return duplicateProjectNameError(input.write.projects[0]?.name ?? '');
      }
      if (failure.kind === 'Conflict' && failure.reason === 'import-not-pending') {
        return importNotPendingError();
      }
      return storageError('Failed to persist import', failure);
    });

export const createUowImportDiscard =
  (uow: UnitOfWork): PersistImportDiscard =>
  (input) =>
    commit(uow, [
      work(
        {
          type: 'import-discard',
          id: input.id,
          organizationId: input.organizationId,
          decidedById: input.decidedById,
          decidedAt: input.decidedAt,
        },
        []
      ),
    ]).mapErr((failure): StorageError | ImportNotPendingError =>
      failure.kind === 'Conflict' && failure.reason === 'import-not-pending'
        ? importNotPendingError()
        : storageError('Failed to discard import', failure)
    );
