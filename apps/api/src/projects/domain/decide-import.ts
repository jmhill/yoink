import { err, ok, type Result } from 'neverthrow';
import type { ImportPreview, ImportPreviewProject, ImportProject, Project, Task } from '@yoink/api-contracts';
import { IMPORT_TASKS_MAX } from '@yoink/api-contracts';
import type { Actor } from '../../shared/auth-context.js';
import { decideCreateTask, type DecideCreateTaskError } from '../../tasks/domain/decide-create.js';
import type { LoadedProject } from '../../tasks/domain/task-commands.js';
import type { TaskCreated, TaskUpdated } from '../../tasks/domain/events.js';
import {
  importEntryError,
  importInvalidError,
  type ImportEntryError,
  type ImportInvalidError,
} from './project-errors.js';
import { notebookPagesFromPaths, parseNotebookPages } from './notebook-pages.js';
import { parseProjectName, projectNameIsTaken, normalizeProjectName } from './project-name.js';
import { parseProjectObjective } from './project-objective.js';
import { parseWaitingOn, parseWaitingSince } from './project-waiting.js';

const TASK_TITLE_MAX = 500;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DecideImportInput = {
  projects: readonly ImportProject[];
  organizationId: string;
  createdById: string;
  existingProjectNames: readonly string[];
  tasksById: ReadonlyMap<string, Task>;
  listsById: ReadonlyMap<string, { id: string; organizationId: string }>;
  memberIds: ReadonlySet<string>;
  nextOpenOrderByListId: ReadonlyMap<string, number>;
  actor: Actor;
  now: string;
  nextId: () => string;
};

export type PlannedImportedTask = {
  current: Task;
  event: TaskUpdated;
};

export type PlannedImportedProject = {
  view: Project;
  importRecordId: string;
  existingTasks: PlannedImportedTask[];
  newTaskEvents: TaskCreated[];
  preview: ImportPreviewProject;
};

export type ImportPlan = {
  organizationId: string;
  actor: Actor;
  now: string;
  projects: PlannedImportedProject[];
  preview: ImportPreview;
};

const entryError = (
  index: number,
  name: string,
  field: string,
  code: string,
  message: string
): ImportEntryError =>
  importEntryError({
    index,
    name,
    field,
    code,
    message,
  });

const parseIsoDate = (raw: string): Result<string, string> => {
  const match = ISO_DATE.exec(raw);
  if (!match) {
    return err('Due date must be a date (YYYY-MM-DD)');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return err('Due date must be a date (YYYY-MM-DD)');
  }
  return ok(raw);
};

const parseTaskTitle = (raw: string): Result<string, { code: string; message: string }> => {
  const title = raw.trim();
  if (title.length === 0) {
    return err({ code: 'TASK_TITLE_BLANK', message: "Title can't be blank" });
  }
  if (title.length > TASK_TITLE_MAX) {
    return err({
      code: 'TASK_TITLE_TOO_LONG',
      message: 'Title must be 500 characters or fewer',
    });
  }
  return ok(title);
};

const listKey = (listId: string | undefined): string => listId ?? '';

const createTaskError = (
  error: DecideCreateTaskError
): { code: string; message: string } => {
  switch (error.type) {
    case 'LIST_NOT_IN_ORGANIZATION':
      return { code: error.type, message: 'List is not in this organization' };
    case 'ASSIGNEE_NOT_IN_ORGANIZATION':
      return {
        code: error.type,
        message: 'Assignee is not a member of this organization',
      };
    case 'PROJECT_NOT_IN_ORGANIZATION':
      return { code: error.type, message: 'Project is not in this organization' };
    case 'PROJECT_DONE':
      return { code: error.type, message: 'That project is done' };
  }
};

export const decideImport = (
  input: DecideImportInput
): Result<ImportPlan, ImportInvalidError> => {
  const errors: ImportEntryError[] = [];
  const batchNames = new Map<string, number>();
  const seenTaskIds = new Map<string, { index: number; name: string }>();
  let taskCount = 0;

  for (const [index, entry] of input.projects.entries()) {
    taskCount += (entry.existingTaskIds ?? []).length + (entry.newTasks ?? []).length;
    const nameKey = normalizeProjectName(entry.name);
    if (nameKey.length > 0) {
      const first = batchNames.get(nameKey);
      if (first !== undefined) {
        errors.push(
          entryError(
            index,
            entry.name,
            'name',
            'DUPLICATE_PROJECT_NAME',
            'A project with this name already exists'
          )
        );
      } else {
        batchNames.set(nameKey, index);
      }
    }
  }

  if (taskCount > IMPORT_TASKS_MAX) {
    errors.push(
      entryError(
        0,
        input.projects[0]?.name ?? '',
        'projects',
        'IMPORT_TOO_MANY_TASKS',
        `An import can attach or create at most ${IMPORT_TASKS_MAX} tasks`
      )
    );
  }

  const planned: PlannedImportedProject[] = [];
  const openOrders = new Map(input.nextOpenOrderByListId);

  for (const [index, entry] of input.projects.entries()) {
    const decided = decideOneEntry(index, entry, input, seenTaskIds, openOrders);
    if (decided.errors.length > 0) {
      errors.push(...decided.errors);
      continue;
    }
    if (decided.planned) {
      planned.push(decided.planned);
    }
  }

  if (errors.length > 0) {
    return err(importInvalidError(errors));
  }

  const preview: ImportPreview = {
    projects: planned.map((item) => item.preview),
    totals: {
      projectCount: planned.length,
      existingTaskCount: planned.reduce((sum, item) => sum + item.existingTasks.length, 0),
      newTaskCount: planned.reduce((sum, item) => sum + item.newTaskEvents.length, 0),
      projectsWithNoNextAction: planned.filter((item) => item.view.nextActionTaskId === null)
        .length,
    },
  };

  return ok({
    organizationId: input.organizationId,
    actor: input.actor,
    now: input.now,
    projects: planned,
    preview,
  });
};

const decideOneEntry = (
  index: number,
  entry: ImportProject,
  input: DecideImportInput,
  seenTaskIds: Map<string, { index: number; name: string }>,
  openOrders: Map<string, number>
): { errors: ImportEntryError[]; planned?: PlannedImportedProject } => {
  const errors: ImportEntryError[] = [];
  const nameLabel = entry.name;
  const add = (field: string, code: string, message: string) => {
    errors.push(entryError(index, nameLabel, field, code, message));
  };

  if (entry.status === 'done' || entry.status === 'proposed') {
    add('status', 'INVALID_PROJECT_STATUS', 'Imported projects cannot be done or proposed');
  }

  const parsedName = parseProjectName(entry.name);
  if (parsedName.isErr()) {
    add('name', parsedName.error.type, parsedName.error.message);
  } else if (projectNameIsTaken(parsedName.value, input.existingProjectNames)) {
    add('name', 'DUPLICATE_PROJECT_NAME', 'A project with this name already exists');
  }

  const objective = parseProjectObjective(entry.objective);

  if (entry.status === 'waiting') {
    if (entry.waitingOn === undefined) {
      add('waitingOn', 'PROJECT_WAITING_ON_REQUIRED', 'Waiting on is required');
    } else {
      const waitingOn = parseWaitingOn(entry.waitingOn);
      if (waitingOn.isErr()) {
        add('waitingOn', waitingOn.error.type, waitingOn.error.message);
      }
    }
    if (entry.waitingSince !== undefined && entry.waitingSince !== null) {
      const since = parseWaitingSince(entry.waitingSince);
      if (since.isErr()) {
        add('waitingSince', since.error.type, since.error.message);
      }
    }
  } else if (entry.waitingOn !== undefined || entry.waitingSince !== undefined) {
    add(
      'waitingOn',
      'IMPORT_WAITING_FIELDS_NOT_ALLOWED',
      'Waiting on and waiting since are only used when status is waiting'
    );
  }

  const notebook =
    entry.notebookPages === undefined
      ? ok([] as string[])
      : parseNotebookPages(entry.notebookPages);
  if (notebook.isErr()) {
    add('notebookPages', notebook.error.type, notebook.error.message);
  }

  const existingIds = entry.existingTaskIds ?? [];
  const existingTasks: PlannedImportedTask[] = [];
  const existingById = new Map<string, Task>();

  for (const [taskIndex, taskId] of existingIds.entries()) {
    const field = `existingTaskIds.${taskIndex}`;
    const seen = seenTaskIds.get(taskId);
    if (seen) {
      add(field, 'TASK_LISTED_TWICE', 'That task is listed more than once in this import');
      continue;
    }
    seenTaskIds.set(taskId, { index, name: nameLabel });

    const task = input.tasksById.get(taskId);
    if (!task || task.organizationId !== input.organizationId) {
      add(field, 'TASK_NOT_FOUND', 'Task not found');
      continue;
    }
    if (task.completedAt) {
      add(field, 'TASK_NOT_OPEN', 'Only an open task can join an imported project');
      continue;
    }
    if (task.projectId) {
      add(field, 'TASK_ALREADY_IN_PROJECT', 'That task is already in a project');
      continue;
    }
    existingById.set(taskId, task);
    existingTasks.push({
      current: task,
      event: {
        type: 'TaskUpdated',
        id: task.id,
        organizationId: task.organizationId,
        projectId: 'pending',
        occurredAt: input.now,
      },
    });
  }

  const newTasks = entry.newTasks ?? [];
  const newTaskKeys = new Map<string, number>();
  const newTaskTitles = new Map<string, string>();

  for (const [taskIndex, newTask] of newTasks.entries()) {
    const field = `newTasks.${taskIndex}`;
    if (newTaskKeys.has(newTask.key)) {
      add(`${field}.key`, 'IMPORT_NEW_TASK_KEY_DUPLICATE', 'New-task keys must be unique in an entry');
      continue;
    }
    newTaskKeys.set(newTask.key, taskIndex);

    const title = parseTaskTitle(newTask.title);
    if (title.isErr()) {
      add(`${field}.title`, title.error.code, title.error.message);
      continue;
    }
    newTaskTitles.set(newTask.key, title.value);

    if (newTask.dueDate !== undefined) {
      const due = parseIsoDate(newTask.dueDate);
      if (due.isErr()) {
        add(`${field}.dueDate`, 'INVALID_TASK_DUE_DATE', due.error);
      }
    }
  }

  let nextActionTitle: string | null = null;
  let nextActionExistingId: string | null = null;
  let nextActionNewKey: string | null = null;

  if (entry.nextAction && 'existingTaskId' in entry.nextAction) {
    const taskId = entry.nextAction.existingTaskId;
    if (!existingById.has(taskId) && !existingIds.includes(taskId)) {
      add('nextAction', 'NEXT_ACTION_NOT_IN_ENTRY', 'Next action must be a task in this entry');
    } else {
      nextActionExistingId = taskId;
      nextActionTitle = existingById.get(taskId)?.title ?? null;
    }
  } else if (entry.nextAction && 'newTaskKey' in entry.nextAction) {
    const key = entry.nextAction.newTaskKey;
    if (!newTaskKeys.has(key)) {
      add('nextAction', 'NEXT_ACTION_NOT_IN_ENTRY', 'Next action must be a task in this entry');
    } else {
      nextActionNewKey = key;
      nextActionTitle = newTaskTitles.get(key) ?? null;
    }
  }

  if (errors.length > 0 || parsedName.isErr() || notebook.isErr()) {
    return { errors };
  }

  if (entry.status === 'done' || entry.status === 'proposed') {
    return { errors };
  }

  const projectId = input.nextId();
  const importRecordId = input.nextId();
  const name = parsedName.value;
  const pages = notebook.value;
  const warnings: ImportPreviewProject['warnings'] = [];

  let waitingOn: string | null = null;
  let waitingSince: string | null = null;
  if (entry.status === 'waiting' && entry.waitingOn !== undefined) {
    const parsedOn = parseWaitingOn(entry.waitingOn);
    if (parsedOn.isOk()) {
      waitingOn = parsedOn.value;
    }
    if (entry.waitingSince === undefined || entry.waitingSince === null) {
      waitingSince = null;
    } else {
      const parsedSince = parseWaitingSince(entry.waitingSince);
      if (parsedSince.isOk()) {
        waitingSince = parsedSince.value;
      }
    }
  }

  const loadedProject: LoadedProject = {
    id: projectId,
    organizationId: input.organizationId,
    status: entry.status,
    nextActionTaskId: null,
  };

  const createdEvents: TaskCreated[] = [];
  const createdIdsByKey = new Map<string, string>();

  for (const [taskIndex, newTask] of newTasks.entries()) {
    const field = `newTasks.${taskIndex}`;
    const title = parseTaskTitle(newTask.title);
    if (title.isErr()) {
      continue;
    }

    let assigneeId = newTask.assigneeId;
    if (assigneeId !== undefined && !input.memberIds.has(assigneeId)) {
      warnings.push({
        field: `${field}.assigneeId`,
        code: 'ASSIGNEE_NOT_IN_ORGANIZATION',
        message: 'Assignee is not a member; this task will import unassigned',
      });
      assigneeId = undefined;
    }

    const destList = listKey(newTask.listId);
    const nextOpenOrder = openOrders.get(destList) ?? 0;
    const list = newTask.listId ? (input.listsById.get(newTask.listId) ?? null) : null;
    const createdId = input.nextId();
    const created = decideCreateTask({
      command: {
        title: title.value,
        dueDate: newTask.dueDate,
        organizationId: input.organizationId,
        createdById: input.createdById,
        assigneeId,
        listId: newTask.listId,
        projectId,
        actor: input.actor,
      },
      list,
      project: loadedProject,
      assigneeInOrganization: assigneeId === undefined ? null : true,
      nextOpenOrder,
      id: createdId,
      now: input.now,
    });

    if (created.isErr()) {
      const mapped = createTaskError(created.error);
      add(field, mapped.code, mapped.message);
      continue;
    }

    openOrders.set(destList, nextOpenOrder + 1);
    createdEvents.push(created.value);
    createdIdsByKey.set(newTask.key, createdId);
  }

  if (errors.length > 0) {
    return { errors };
  }

  const nextActionTaskId =
    nextActionExistingId ??
    (nextActionNewKey ? (createdIdsByKey.get(nextActionNewKey) ?? null) : null);

  for (const planned of existingTasks) {
    planned.event.projectId = projectId;
  }

  const view: Project = {
    id: projectId,
    organizationId: input.organizationId,
    createdById: input.createdById,
    name,
    status: entry.status,
    waitingOn,
    waitingSince,
    nextActionTaskId,
    notebookPages: notebookPagesFromPaths(pages),
    createdAt: input.now,
    lastChangedAt: input.now,
    lastChangedBy: input.createdById,
  };
  if (objective !== undefined) {
    view.objective = objective;
  }

  const preview: ImportPreviewProject = {
    name,
    status: entry.status,
    waitingOn,
    waitingSince,
    nextActionTitle,
    tasks: [
      ...existingTasks.map((item) => ({ title: item.current.title, source: 'existing' as const })),
      ...createdEvents.map((event) => ({ title: event.title, source: 'new' as const })),
    ],
    notebookPages: view.notebookPages,
    warnings,
  };
  if (objective !== undefined) {
    preview.objective = objective;
  }

  return {
    errors: [],
    planned: {
      view,
      importRecordId,
      existingTasks,
      newTaskEvents: createdEvents,
      preview,
    },
  };
};
