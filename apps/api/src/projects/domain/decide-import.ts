import { err, ok, type Result } from 'neverthrow';
import type { ImportPreview, ImportPreviewProject, ImportProject, Project, Task } from '@yoink/api-contracts';
import { IMPORT_TASKS_MAX, PROJECT_OBJECTIVE_MAX_LENGTH } from '@yoink/api-contracts';
import type { Actor } from '../../shared/auth-context.js';
import { parseIsoDate } from '../../shared/domain/iso-date.js';
import { decideCreateTask, type DecideCreateTaskError } from '../../tasks/domain/decide-create.js';
import type { LoadedProject } from '../../tasks/domain/task-commands.js';
import type { TaskCreated, TaskUpdated } from '../../tasks/domain/events.js';
import { parseTaskTitle } from '../../tasks/domain/task-title.js';
import {
  importInvalidError,
  type ImportEntryError,
  type ImportInvalidError,
} from './project-errors.js';
import { notebookPagesFromPaths, parseNotebookPages } from './notebook-pages.js';
import { parseProjectName, projectNameIsTaken, normalizeProjectName } from './project-name.js';
import { parseProjectObjective } from './project-objective.js';
import { parseWaitingOn, parseWaitingSince } from './project-waiting.js';

export type DecideImportInput = {
  projects: readonly ImportProject[];
  organizationId: string;
  createdById: string;
  existingProjectNames: readonly string[];
  tasksById: ReadonlyMap<string, Task>;
  listsById: ReadonlyMap<string, { id: string; organizationId: string }>;
  memberIds: ReadonlySet<string>;
  assigneeNamesById: ReadonlyMap<string, string>;
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
  message: string,
  taskTitle?: string
): ImportEntryError => ({
  index,
  name,
  field,
  code,
  message,
  ...(taskTitle !== undefined ? { taskTitle } : {}),
});

const compareEntryErrors = (left: ImportEntryError, right: ImportEntryError): number =>
  left.index - right.index || left.field.localeCompare(right.field);

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
    case 'PROJECT_PROPOSED':
      return { code: error.type, message: 'That project is a proposal' };
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
            'IMPORT_DUPLICATE_NAME_IN_BATCH',
            'This name is used more than once in this import'
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
    return err(importInvalidError([...errors].sort(compareEntryErrors)));
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
  const add = (field: string, code: string, message: string, taskTitle?: string) => {
    errors.push(entryError(index, nameLabel, field, code, message, taskTitle));
  };

  if (entry.status === 'done' || entry.status === 'proposed') {
    add(
      'status',
      'INVALID_PROJECT_STATUS',
      'Imported projects cannot be done or proposed'
    );
  }

  const parsedName = parseProjectName(entry.name);
  if (parsedName.isErr()) {
    add('name', parsedName.error.type, parsedName.error.message);
  } else if (projectNameIsTaken(parsedName.value, input.existingProjectNames)) {
    add('name', 'DUPLICATE_PROJECT_NAME', 'A project with this name already exists');
  }

  const objective = parseProjectObjective(entry.objective);
  if (objective !== undefined && objective.length > PROJECT_OBJECTIVE_MAX_LENGTH) {
    add(
      'objective',
      'PROJECT_OBJECTIVE_TOO_LONG',
      `Objective must be ${PROJECT_OBJECTIVE_MAX_LENGTH} characters or fewer`
    );
  }

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
    const field = entry.waitingOn !== undefined ? 'waitingOn' : 'waitingSince';
    add(
      field,
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
  const existingById = new Map<string, Task>();

  for (const [taskIndex, taskId] of existingIds.entries()) {
    const field = `existingTaskIds.${taskIndex}`;
    const seen = seenTaskIds.get(taskId);
    if (seen) {
      add(
        field,
        'TASK_LISTED_TWICE',
        'That task is listed more than once in this import',
        input.tasksById.get(taskId)?.title
      );
      continue;
    }
    seenTaskIds.set(taskId, { index, name: nameLabel });

    const task = input.tasksById.get(taskId);
    if (!task || task.organizationId !== input.organizationId) {
      add(field, 'TASK_NOT_FOUND', 'Task not found');
      continue;
    }
    if (task.completedAt) {
      add(field, 'TASK_NOT_OPEN', 'Only an open task can join an imported project', task.title);
      continue;
    }
    if (task.projectId) {
      add(field, 'TASK_ALREADY_IN_PROJECT', 'That task is already in a project', task.title);
      continue;
    }
    existingById.set(taskId, task);
  }

  const newTasks = entry.newTasks ?? [];
  const newTaskKeys = new Map<string, number>();
  const newTaskTitles = new Map<string, string>();

  for (const [taskIndex, newTask] of newTasks.entries()) {
    const field = `newTasks.${taskIndex}`;
    if (newTaskKeys.has(newTask.key)) {
      add(`${field}.key`, 'IMPORT_NEW_TASK_KEY_DUPLICATE', 'New-task keys must be unique in an entry');
    } else {
      newTaskKeys.set(newTask.key, taskIndex);
    }

    const title = parseTaskTitle(newTask.title);
    if (title.isErr()) {
      add(`${field}.title`, title.error.type, title.error.message);
    } else {
      newTaskTitles.set(newTask.key, title.value);
    }

    if (newTask.dueDate !== undefined) {
      const due = parseIsoDate(newTask.dueDate);
      if (due.isErr()) {
        add(`${field}.dueDate`, 'INVALID_TASK_DUE_DATE', 'Due date must be a date (YYYY-MM-DD)');
      }
    }

    if (newTask.listId !== undefined) {
      const list = input.listsById.get(newTask.listId);
      if (!list || list.organizationId !== input.organizationId) {
        add(`${field}.listId`, 'LIST_NOT_IN_ORGANIZATION', 'List is not in this organization');
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

  const existingTasks: PlannedImportedTask[] = [...existingById.values()].map((task) => ({
    current: task,
    event: {
      type: 'TaskUpdated',
      id: task.id,
      organizationId: task.organizationId,
      projectId,
      occurredAt: input.now,
    },
  }));

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
      ...existingTasks.map((item) => {
        const assigneeId = item.current.assigneeId;
        const assigneeName =
          assigneeId !== undefined ? input.assigneeNamesById.get(assigneeId) : undefined;
        return {
          title: item.current.title,
          source: 'existing' as const,
          ...(item.current.dueDate !== undefined ? { dueDate: item.current.dueDate } : {}),
          ...(assigneeName !== undefined ? { assigneeName } : {}),
        };
      }),
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
