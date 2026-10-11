import type { Project } from '@yoink/api-contracts';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import { hiddenFor } from '../../shared/change-log/domain/kinds.js';
import type { ProjectImportedPayloadV1 } from '../../shared/change-log/domain/payloads.js';
import { changeLogIdsForTaskUpdated, type TaskUpdatedChangeLogIds } from '../../tasks/domain/change-log-records.js';
import { planTaskChange, type TaskChangePlan } from '../../tasks/domain/plan-task-change.js';
import type { ImportPlan, PlannedImportedProject } from './decide-import.js';

export type ImportWritePlan = {
  organizationId: string;
  projects: Project[];
  importRecords: ChangeLogRecord[];
  tasks: TaskChangePlan[];
};

const stampImport = (
  records: readonly ChangeLogRecord[],
  importRecordId: string,
  projectName: string
): ChangeLogRecord[] =>
  records.map((record) => {
    if (record.kind === 'TaskCreated') {
      return {
        ...record,
        payload: {
          ...record.payload,
          via: 'import' as const,
          importRecordId,
          projectName,
        },
      };
    }
    if (record.kind === 'TaskUpdated') {
      return {
        ...record,
        payload: { ...record.payload, via: 'import' as const, importRecordId },
      };
    }
    if (record.kind === 'TaskAddedToProject') {
      return {
        ...record,
        payload: {
          ...record.payload,
          via: 'import' as const,
          importRecordId,
          projectName,
        },
      };
    }
    return record;
  });

const projectImportedRecord = (
  planned: PlannedImportedProject,
  actor: ImportPlan['actor']
): ChangeLogRecord => {
  const payload: ProjectImportedPayloadV1 = {
    taskCount: planned.existingTasks.length + planned.newTaskEvents.length,
    name: planned.view.name,
    status: planned.view.status,
    waitingOn: planned.view.waitingOn,
    waitingSince: planned.view.waitingSince,
    nextActionTaskId: planned.view.nextActionTaskId,
    notebookPages: planned.view.notebookPages.map((page) => page.path),
    taskIds: planned.existingTasks.map((item) => item.current.id),
    createdTaskIds: planned.newTaskEvents.map((event) => event.id),
  };
  if (planned.view.objective !== undefined) {
    payload.objective = planned.view.objective;
  }

  return {
    id: planned.importRecordId,
    organizationId: planned.view.organizationId,
    projectId: planned.view.id,
    subjectType: 'project',
    subjectId: planned.view.id,
    kind: 'ProjectImported',
    schemaVersion: 1,
    payload,
    actorUserId: actor.userId,
    actorKind: actor.kind,
    occurredAt: planned.view.createdAt,
    hidden: hiddenFor('ProjectImported'),
  };
};

export const planImport = (plan: ImportPlan, nextId: () => string): ImportWritePlan => {
  const importRecords: ChangeLogRecord[] = [];
  const tasks: TaskChangePlan[] = [];

  for (const planned of plan.projects) {
    importRecords.push(projectImportedRecord(planned, plan.actor));

    for (const existing of planned.existingTasks) {
      const ids: TaskUpdatedChangeLogIds = changeLogIdsForTaskUpdated(
        existing.event,
        existing.current,
        nextId
      );
      const taskPlan = planTaskChange({
        event: existing.event,
        current: existing.current,
        actor: plan.actor,
        ids,
        destinationProjectName: planned.view.name,
      });
      tasks.push({
        ...taskPlan,
        records: stampImport(taskPlan.records, planned.importRecordId, planned.view.name),
      });
    }

    for (const created of planned.newTaskEvents) {
      const taskPlan = planTaskChange({
        event: created,
        current: null,
        actor: plan.actor,
        ids: { recordId: nextId() },
      });
      tasks.push({
        ...taskPlan,
        records: stampImport(taskPlan.records, planned.importRecordId, planned.view.name),
      });
    }
  }

  return {
    organizationId: plan.organizationId,
    projects: plan.projects.map((item) => item.view),
    importRecords,
    tasks,
  };
};
