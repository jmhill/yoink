import { describe, it, expect } from 'vitest';
import type { ImportProject, Task } from '@yoink/api-contracts';
import { decideImport, type DecideImportInput } from './decide-import.js';
import { buildObsidianUrl } from './notebook-pages.js';

const now = '2026-10-11T15:00:00.000Z';
const person = { kind: 'user' as const, userId: 'user-1', via: 'session' as const };

const task = (id: string, title: string, overrides: Partial<Task> = {}): Task => ({
  id,
  organizationId: 'org-1',
  createdById: 'user-1',
  title,
  createdAt: '2026-10-01T10:00:00.000Z',
  lastChangedAt: '2026-10-01T10:00:00.000Z',
  lastChangedBy: 'user-1',
  completedBy: null,
  ...overrides,
});

const paint = task('task-paint', 'Paint the door');
const hinges = task('task-hinges', 'Order hinges');
const hook = task('task-hook', 'Hang the hook');

const nextIds = () => {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
};

const inputOf = (
  projects: ImportProject[],
  overrides: Partial<DecideImportInput> = {}
): DecideImportInput => ({
  projects,
  organizationId: 'org-1',
  createdById: 'user-1',
  existingProjectNames: [],
  tasksById: new Map([
    [paint.id, paint],
    [hinges.id, hinges],
    [hook.id, hook],
  ]),
  listsById: new Map(),
  memberIds: new Set(['user-1']),
  nextOpenOrderByListId: new Map([['', 0]]),
  actor: person,
  now,
  nextId: nextIds(),
  ...overrides,
});

const harbor: ImportProject = {
  name: 'Harbor shed',
  objective: 'Keep the dock usable',
  status: 'active',
  notebookPages: ['notes/Harbor shed (dock).md', 'notes/Harbor shed winter.md'],
  existingTaskIds: [paint.id, hinges.id, hook.id],
  nextAction: { existingTaskId: paint.id },
};

const permit: ImportProject = {
  name: 'Permit desk',
  objective: 'Get the slip approved',
  status: 'waiting',
  waitingOn: 'City hall',
  waitingSince: null,
  newTasks: [{ key: 'call-clerk', title: 'Call the clerk' }],
  nextAction: { newTaskKey: 'call-clerk' },
};

const cover: ImportProject = {
  name: 'Winter boat cover',
  status: 'someday',
  newTasks: [{ key: 'measure', title: 'Measure the cockpit' }],
};

describe('decideImport', () => {
  it('builds a preview for a valid three-project batch in entry order', () => {
    const result = decideImport(inputOf([harbor, permit, cover]));
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }

    expect(result.value.preview.totals).toEqual({
      projectCount: 3,
      existingTaskCount: 3,
      newTaskCount: 2,
      projectsWithNoNextAction: 1,
    });
    expect(result.value.preview.projects).toEqual([
      {
        name: 'Harbor shed',
        objective: 'Keep the dock usable',
        status: 'active',
        waitingOn: null,
        waitingSince: null,
        nextActionTitle: 'Paint the door',
        tasks: [
          { title: 'Paint the door', source: 'existing' },
          { title: 'Order hinges', source: 'existing' },
          { title: 'Hang the hook', source: 'existing' },
        ],
        notebookPages: [
          {
            path: 'notes/Harbor shed (dock).md',
            url: buildObsidianUrl('notes/Harbor shed (dock).md'),
          },
          {
            path: 'notes/Harbor shed winter.md',
            url: buildObsidianUrl('notes/Harbor shed winter.md'),
          },
        ],
        warnings: [],
      },
      {
        name: 'Permit desk',
        objective: 'Get the slip approved',
        status: 'waiting',
        waitingOn: 'City hall',
        waitingSince: null,
        nextActionTitle: 'Call the clerk',
        tasks: [{ title: 'Call the clerk', source: 'new' }],
        notebookPages: [],
        warnings: [],
      },
      {
        name: 'Winter boat cover',
        status: 'someday',
        waitingOn: null,
        waitingSince: null,
        nextActionTitle: null,
        tasks: [{ title: 'Measure the cockpit', source: 'new' }],
        notebookPages: [],
        warnings: [],
      },
    ]);
  });

  it('returns every per-entry error in order', () => {
    const result = decideImport(
      inputOf([
        { name: '   ', status: 'active' },
        { name: 'Harbor shed', status: 'done' },
        {
          name: 'Permit desk',
          status: 'active',
          waitingOn: 'City hall',
        },
        {
          name: 'Cover',
          status: 'waiting',
        },
        {
          name: 'harbor shed',
          status: 'active',
        },
      ])
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.type).toBe('IMPORT_INVALID');
    expect(result.error.errors).toEqual([
      {
        index: 4,
        name: 'harbor shed',
        field: 'name',
        code: 'DUPLICATE_PROJECT_NAME',
        message: 'A project with this name already exists',
      },
      {
        index: 0,
        name: '   ',
        field: 'name',
        code: 'PROJECT_NAME_BLANK',
        message: "Name can't be blank",
      },
      {
        index: 1,
        name: 'Harbor shed',
        field: 'status',
        code: 'INVALID_PROJECT_STATUS',
        message: 'Imported projects cannot be done or proposed',
      },
      {
        index: 2,
        name: 'Permit desk',
        field: 'waitingOn',
        code: 'IMPORT_WAITING_FIELDS_NOT_ALLOWED',
        message: 'Waiting on and waiting since are only used when status is waiting',
      },
      {
        index: 3,
        name: 'Cover',
        field: 'waitingOn',
        code: 'PROJECT_WAITING_ON_REQUIRED',
        message: 'Waiting on is required',
      },
    ]);
  });

  it('refuses a name that already exists in the org', () => {
    const result = decideImport(
      inputOf([{ name: 'Harbor shed', status: 'active' }], {
        existingProjectNames: ['Harbor shed'],
      })
    );
    expect(result._unsafeUnwrapErr().errors).toEqual([
      {
        index: 0,
        name: 'Harbor shed',
        field: 'name',
        code: 'DUPLICATE_PROJECT_NAME',
        message: 'A project with this name already exists',
      },
    ]);
  });

  it('refuses a name that is too long', () => {
    const name = 'H'.repeat(201);
    const result = decideImport(inputOf([{ name, status: 'active' }]));
    expect(result._unsafeUnwrapErr().errors[0]).toEqual({
      index: 0,
      name,
      field: 'name',
      code: 'INVALID_PROJECT_NAME',
      message: 'Name must be 200 characters or fewer',
    });
  });

  it('refuses proposed status', () => {
    const result = decideImport(inputOf([{ name: 'Harbor shed', status: 'proposed' }]));
    expect(result._unsafeUnwrapErr().errors[0]?.code).toBe('INVALID_PROJECT_STATUS');
  });

  it('refuses a bad waitingSince', () => {
    const result = decideImport(
      inputOf([
        {
          name: 'Permit desk',
          status: 'waiting',
          waitingOn: 'City hall',
          waitingSince: 'October 1',
        },
      ])
    );
    expect(result._unsafeUnwrapErr().errors[0]).toMatchObject({
      field: 'waitingSince',
      code: 'INVALID_WAITING_SINCE',
    });
  });

  it('refuses a missing task, a finished task, a task already in a project, and a duplicate listing', () => {
    const finished = task('task-done', 'Already done', {
      completedAt: now,
    });
    const claimed = task('task-claimed', 'Already claimed', { projectId: 'project-other' });
    const result = decideImport(
      inputOf(
        [
          {
            name: 'Harbor shed',
            status: 'active',
            existingTaskIds: ['task-missing', finished.id, claimed.id, paint.id],
          },
          {
            name: 'Other dock',
            status: 'active',
            existingTaskIds: [paint.id],
          },
        ],
        {
          tasksById: new Map([
            [paint.id, paint],
            [finished.id, finished],
            [claimed.id, claimed],
          ]),
        }
      )
    );

    expect(result._unsafeUnwrapErr().errors).toEqual([
      {
        index: 0,
        name: 'Harbor shed',
        field: 'existingTaskIds.0',
        code: 'TASK_NOT_FOUND',
        message: 'Task not found',
      },
      {
        index: 0,
        name: 'Harbor shed',
        field: 'existingTaskIds.1',
        code: 'TASK_NOT_OPEN',
        message: 'Only an open task can join an imported project',
      },
      {
        index: 0,
        name: 'Harbor shed',
        field: 'existingTaskIds.2',
        code: 'TASK_ALREADY_IN_PROJECT',
        message: 'That task is already in a project',
      },
      {
        index: 1,
        name: 'Other dock',
        field: 'existingTaskIds.0',
        code: 'TASK_LISTED_TWICE',
        message: 'That task is listed more than once in this import',
      },
    ]);
  });

  it('refuses a next action that is not in the entry', () => {
    const result = decideImport(
      inputOf([
        {
          name: 'Harbor shed',
          status: 'active',
          existingTaskIds: [paint.id],
          nextAction: { existingTaskId: hinges.id },
        },
      ])
    );
    expect(result._unsafeUnwrapErr().errors).toEqual([
      {
        index: 0,
        name: 'Harbor shed',
        field: 'nextAction',
        code: 'NEXT_ACTION_NOT_IN_ENTRY',
        message: 'Next action must be a task in this entry',
      },
    ]);
  });

  it('refuses a new-task next action key that is not in the entry', () => {
    const result = decideImport(
      inputOf([
        {
          name: 'Permit desk',
          status: 'someday',
          newTasks: [{ key: 'measure', title: 'Measure the cockpit' }],
          nextAction: { newTaskKey: 'missing' },
        },
      ])
    );
    expect(result._unsafeUnwrapErr().errors[0]?.code).toBe('NEXT_ACTION_NOT_IN_ENTRY');
  });

  it('refuses a bad notebook path', () => {
    const result = decideImport(
      inputOf([
        {
          name: 'Harbor shed',
          status: 'active',
          notebookPages: ['/absolute.md'],
        },
      ])
    );
    expect(result._unsafeUnwrapErr().errors[0]).toMatchObject({
      field: 'notebookPages',
      code: 'INVALID_NOTEBOOK_PATH',
    });
  });

  it('refuses a blank new-task title', () => {
    const result = decideImport(
      inputOf([
        {
          name: 'Harbor shed',
          status: 'active',
          newTasks: [{ key: 'blank', title: '   ' }],
        },
      ])
    );
    expect(result._unsafeUnwrapErr().errors[0]).toMatchObject({
      field: 'newTasks.0.title',
      code: 'TASK_TITLE_BLANK',
    });
  });

  it('warns and imports unassigned when the assignee is not a member', () => {
    const result = decideImport(
      inputOf([
        {
          name: 'Harbor shed',
          status: 'active',
          newTasks: [
            {
              key: 'fin-item',
              title: 'Ask Fin about the invoice',
              assigneeId: 'user-fin',
            },
          ],
        },
      ])
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.preview.projects[0]?.warnings).toEqual([
      {
        field: 'newTasks.0.assigneeId',
        code: 'ASSIGNEE_NOT_IN_ORGANIZATION',
        message: 'Assignee is not a member; this task will import unassigned',
      },
    ]);
    expect(result.value.projects[0]?.newTaskEvents[0]?.assigneeId).toBeUndefined();
  });

  it('keeps waiting since unknown when it is omitted or null', () => {
    const omitted = decideImport(
      inputOf([
        {
          name: 'Permit desk',
          status: 'waiting',
          waitingOn: 'City hall',
        },
      ])
    );
    const explicit = decideImport(
      inputOf([
        {
          name: 'Permit desk',
          status: 'waiting',
          waitingOn: 'City hall',
          waitingSince: null,
        },
      ])
    );
    expect(omitted._unsafeUnwrap().projects[0]?.view.waitingSince).toBeNull();
    expect(explicit._unsafeUnwrap().projects[0]?.view.waitingSince).toBeNull();
  });
});
