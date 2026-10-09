import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import type { NamedList, Task } from '@yoink/api-contracts';
import { createListHandlers } from './create-list-handlers.js';
import type { CommandLogFields } from '../../shared/change-log/application/command-log.js';
import type { PersistNamedListChange } from './ports.js';

const groceries: NamedList = {
  id: 'list-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  name: 'Groceries',
  createdAt: '2025-01-15T10:00:00.000Z',
};

const milk: Task = {
  id: 'task-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  title: 'Milk',
  createdAt: '2025-01-15T10:00:00.000Z',
  listId: 'list-1',
  openOrder: 0,
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
};

const collectLogger = () => {
  const lines: CommandLogFields[] = [];
  return {
    lines,
    logger: {
      info: (fields: CommandLogFields) => {
        lines.push(fields);
      },
    },
  };
};

const persist: PersistNamedListChange = () => okAsync(undefined);

const handlersOf = (logger: ReturnType<typeof collectLogger>['logger']) =>
  createListHandlers({
    persist,
    list: () => okAsync([groceries]),
    pageNamedLists: () => okAsync({ rows: [groceries], total: 1 }),
    load: () => okAsync(groceries),
    countOpenOnList: () => okAsync(0),
    loadOpenTasksOnList: () => okAsync([milk]),
    pageOpenTasksOnList: () => okAsync({ rows: [milk], total: 1 }),
    loadTasksByIds: () => okAsync([]),
    nextId: () => 'id-1',
    now: () => '2025-01-15T11:00:00.000Z',
    logger,
  });

describe('createListHandlers command logging', () => {
  it.each([
    ['create', (h: ReturnType<typeof handlersOf>) =>
      h.create({
        name: 'Weekend',
        organizationId: 'org-1',
        createdById: 'user-1',
        actor: null,
      })],
    ['rename', (h: ReturnType<typeof handlersOf>) =>
      h.rename({
        id: 'list-1',
        organizationId: 'org-1',
        name: 'Shopping',
        actor: null,
      })],
    ['delete', (h: ReturnType<typeof handlersOf>) =>
      h.delete({ id: 'list-1', organizationId: 'org-1', actor: null })],
    ['reorderOpenTasks', (h: ReturnType<typeof handlersOf>) =>
      h.reorderOpenTasks({
        organizationId: 'org-1',
        listId: 'list-1',
        taskIds: ['task-1'],
        actor: null,
      })],
    ['reorderUnlistedOpenTasks', (h: ReturnType<typeof handlersOf>) =>
      h.reorderUnlistedOpenTasks({
        organizationId: 'org-1',
        taskIds: ['task-1'],
        actor: null,
      })],
  ] as const)('logs %s exactly once', async (_name, run) => {
    const { lines, logger } = collectLogger();
    const result = await run(handlersOf(logger));
    expect(result.isOk() || result.isErr()).toBe(true);
    expect(lines).toHaveLength(1);
  });
});
