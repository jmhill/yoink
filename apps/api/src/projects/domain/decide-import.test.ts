import { describe, it, expect } from 'vitest';
import { IMPORT_TASKS_MAX, PROJECT_OBJECTIVE_MAX_LENGTH } from '@yoink/api-contracts';
import type { ImportProject, Task } from '@yoink/api-contracts';
import { decideImport, type DecideImportInput } from './decide-import.js';
import { buildObsidianUrl } from './notebook-pages.js';

const now = '2026-10-11T15:00:00.000Z';
const person = { kind: 'user' as const, userId: 'user-1', via: 'session' as const };
const unknownListId = '00000000-0000-4000-8000-0000000000b1';

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

const expectErrors = (
  projects: ImportProject[],
  expected: Array<{
    index: number;
    name: string;
    field: string;
    code: string;
    message: string;
  }>,
  overrides: Partial<DecideImportInput> = {}
) => {
  const result = decideImport(inputOf(projects, overrides));
  expect(result.isErr()).toBe(true);
  if (!result.isErr()) {
    return;
  }
  expect(result.error.type).toBe('IMPORT_INVALID');
  expect(result.error.errors).toEqual(expected);
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
    expect(result.value.projects[0]?.existingTasks.map((item) => item.event.projectId)).toEqual([
      result.value.projects[0]?.view.id,
      result.value.projects[0]?.view.id,
      result.value.projects[0]?.view.id,
    ]);
  });

  it('returns every per-entry error sorted by index then field', () => {
    expectErrors(
      [
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
      ],
      [
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
        {
          index: 4,
          name: 'harbor shed',
          field: 'name',
          code: 'IMPORT_DUPLICATE_NAME_IN_BATCH',
          message: 'This name is used more than once in this import',
        },
      ]
    );
  });

  it('refuses a name that already exists in the org', () => {
    expectErrors(
      [{ name: 'Harbor shed', status: 'active' }],
      [
        {
          index: 0,
          name: 'Harbor shed',
          field: 'name',
          code: 'DUPLICATE_PROJECT_NAME',
          message: 'A project with this name already exists',
        },
      ],
      { existingProjectNames: ['Harbor shed'] }
    );
  });

  it('refuses a name that is too long', () => {
    const name = 'H'.repeat(201);
    expectErrors([{ name, status: 'active' }], [
      {
        index: 0,
        name,
        field: 'name',
        code: 'INVALID_PROJECT_NAME',
        message: 'Name must be 200 characters or fewer',
      },
    ]);
  });

  it('refuses done status', () => {
    expectErrors([{ name: 'Harbor shed', status: 'done' }], [
      {
        index: 0,
        name: 'Harbor shed',
        field: 'status',
        code: 'INVALID_PROJECT_STATUS',
        message: 'Imported projects cannot be done or proposed',
      },
    ]);
  });

  it('refuses proposed status', () => {
    expectErrors([{ name: 'Harbor shed', status: 'proposed' }], [
      {
        index: 0,
        name: 'Harbor shed',
        field: 'status',
        code: 'INVALID_PROJECT_STATUS',
        message: 'Imported projects cannot be done or proposed',
      },
    ]);
  });

  it('refuses a blank waitingOn', () => {
    expectErrors(
      [
        {
          name: 'Permit desk',
          status: 'waiting',
          waitingOn: '   ',
        },
      ],
      [
        {
          index: 0,
          name: 'Permit desk',
          field: 'waitingOn',
          code: 'PROJECT_WAITING_ON_BLANK',
          message: "Waiting on can't be blank",
        },
      ]
    );
  });

  it('refuses a too-long waitingOn', () => {
    const waitingOn = 'W'.repeat(201);
    expectErrors(
      [
        {
          name: 'Permit desk',
          status: 'waiting',
          waitingOn,
        },
      ],
      [
        {
          index: 0,
          name: 'Permit desk',
          field: 'waitingOn',
          code: 'PROJECT_WAITING_ON_TOO_LONG',
          message: 'Waiting on must be 200 characters or fewer',
        },
      ]
    );
  });

  it('reports a waitingSince-only error under waitingSince', () => {
    expectErrors(
      [
        {
          name: 'Harbor shed',
          status: 'active',
          waitingSince: '2026-10-01',
        },
      ],
      [
        {
          index: 0,
          name: 'Harbor shed',
          field: 'waitingSince',
          code: 'IMPORT_WAITING_FIELDS_NOT_ALLOWED',
          message: 'Waiting on and waiting since are only used when status is waiting',
        },
      ]
    );
  });

  it('refuses a bad waitingSince', () => {
    expectErrors(
      [
        {
          name: 'Permit desk',
          status: 'waiting',
          waitingOn: 'City hall',
          waitingSince: 'October 1',
        },
      ],
      [
        {
          index: 0,
          name: 'Permit desk',
          field: 'waitingSince',
          code: 'INVALID_WAITING_SINCE',
          message: 'Waiting since must be a date (YYYY-MM-DD) or unknown',
        },
      ]
    );
  });

  it('refuses a missing task, a finished task, a task already in a project, and a duplicate listing', () => {
    const finished = task('task-done', 'Already done', {
      completedAt: now,
    });
    const claimed = task('task-claimed', 'Already claimed', { projectId: 'project-other' });
    expectErrors(
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
      [
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
      ],
      {
        tasksById: new Map([
          [paint.id, paint],
          [finished.id, finished],
          [claimed.id, claimed],
        ]),
      }
    );
  });

  it('refuses a next action that is not in the entry', () => {
    expectErrors(
      [
        {
          name: 'Harbor shed',
          status: 'active',
          existingTaskIds: [paint.id],
          nextAction: { existingTaskId: hinges.id },
        },
      ],
      [
        {
          index: 0,
          name: 'Harbor shed',
          field: 'nextAction',
          code: 'NEXT_ACTION_NOT_IN_ENTRY',
          message: 'Next action must be a task in this entry',
        },
      ]
    );
  });

  it('refuses a new-task next action key that is not in the entry', () => {
    expectErrors(
      [
        {
          name: 'Permit desk',
          status: 'someday',
          newTasks: [{ key: 'measure', title: 'Measure the cockpit' }],
          nextAction: { newTaskKey: 'missing' },
        },
      ],
      [
        {
          index: 0,
          name: 'Permit desk',
          field: 'nextAction',
          code: 'NEXT_ACTION_NOT_IN_ENTRY',
          message: 'Next action must be a task in this entry',
        },
      ]
    );
  });

  it('returns both a bad notebook path and an unknown listId', () => {
    expectErrors(
      [
        {
          name: 'Harbor shed',
          status: 'active',
          notebookPages: ['/absolute.md'],
          newTasks: [{ key: 'hinges', title: 'Order hinges', listId: unknownListId }],
        },
      ],
      [
        {
          index: 0,
          name: 'Harbor shed',
          field: 'newTasks.0.listId',
          code: 'LIST_NOT_IN_ORGANIZATION',
          message: 'List is not in this organization',
        },
        {
          index: 0,
          name: 'Harbor shed',
          field: 'notebookPages',
          code: 'INVALID_NOTEBOOK_PATH',
          message: 'Notebook path must be vault-relative',
        },
      ]
    );
  });

  it('refuses a new-task list that is not in the org', () => {
    expectErrors(
      [
        {
          name: 'Harbor shed',
          status: 'active',
          newTasks: [{ key: 'hinges', title: 'Order hinges', listId: unknownListId }],
        },
      ],
      [
        {
          index: 0,
          name: 'Harbor shed',
          field: 'newTasks.0.listId',
          code: 'LIST_NOT_IN_ORGANIZATION',
          message: 'List is not in this organization',
        },
      ]
    );
  });

  it('refuses a blank new-task title', () => {
    expectErrors(
      [
        {
          name: 'Harbor shed',
          status: 'active',
          newTasks: [{ key: 'blank', title: '   ' }],
        },
      ],
      [
        {
          index: 0,
          name: 'Harbor shed',
          field: 'newTasks.0.title',
          code: 'TASK_TITLE_BLANK',
          message: "Title can't be blank",
        },
      ]
    );
  });

  it('refuses a too-long new-task title', () => {
    const title = 'T'.repeat(501);
    expectErrors(
      [
        {
          name: 'Harbor shed',
          status: 'active',
          newTasks: [{ key: 'long', title }],
        },
      ],
      [
        {
          index: 0,
          name: 'Harbor shed',
          field: 'newTasks.0.title',
          code: 'TASK_TITLE_TOO_LONG',
          message: 'Title must be 500 characters or fewer',
        },
      ]
    );
  });

  it('refuses a bad new-task due date', () => {
    expectErrors(
      [
        {
          name: 'Harbor shed',
          status: 'active',
          newTasks: [{ key: 'hinges', title: 'Order hinges', dueDate: '2026-13-40' }],
        },
      ],
      [
        {
          index: 0,
          name: 'Harbor shed',
          field: 'newTasks.0.dueDate',
          code: 'INVALID_TASK_DUE_DATE',
          message: 'Due date must be a date (YYYY-MM-DD)',
        },
      ]
    );
  });

  it('refuses a duplicate new-task key', () => {
    expectErrors(
      [
        {
          name: 'Harbor shed',
          status: 'active',
          newTasks: [
            { key: 'hinges', title: 'Order hinges' },
            { key: 'hinges', title: 'Buy screws' },
          ],
        },
      ],
      [
        {
          index: 0,
          name: 'Harbor shed',
          field: 'newTasks.1.key',
          code: 'IMPORT_NEW_TASK_KEY_DUPLICATE',
          message: 'New-task keys must be unique in an entry',
        },
      ]
    );
  });

  it('refuses too many tasks', () => {
    const projects: ImportProject[] = [
      {
        name: 'Harbor shed',
        status: 'active',
        newTasks: Array.from({ length: IMPORT_TASKS_MAX + 1 }, (_, index) => ({
          key: `task-${index}`,
          title: `Task ${index}`,
        })),
      },
    ];
    expectErrors(projects, [
      {
        index: 0,
        name: 'Harbor shed',
        field: 'projects',
        code: 'IMPORT_TOO_MANY_TASKS',
        message: `An import can attach or create at most ${IMPORT_TASKS_MAX} tasks`,
      },
    ]);
  });

  it('refuses a too-long objective', () => {
    const objective = 'O'.repeat(PROJECT_OBJECTIVE_MAX_LENGTH + 1);
    expectErrors(
      [
        {
          name: 'Harbor shed',
          status: 'active',
          objective,
        },
      ],
      [
        {
          index: 0,
          name: 'Harbor shed',
          field: 'objective',
          code: 'PROJECT_OBJECTIVE_TOO_LONG',
          message: `Objective must be ${PROJECT_OBJECTIVE_MAX_LENGTH} characters or fewer`,
        },
      ]
    );
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
    expect(omitted.isOk()).toBe(true);
    expect(explicit.isOk()).toBe(true);
    if (!omitted.isOk() || !explicit.isOk()) {
      return;
    }
    expect(omitted.value.projects[0]?.view.waitingSince).toBeNull();
    expect(explicit.value.projects[0]?.view.waitingSince).toBeNull();
  });
});
