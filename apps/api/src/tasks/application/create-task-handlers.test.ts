import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import { createTaskHandlers } from './create-task-handlers.js';
import type { CommandLogFields } from '../../shared/change-log/application/command-log.js';
import type { PersistTaskChange } from './ports.js';

const lastChanged = {
  lastChangedAt: '2025-01-15T10:00:00.000Z',
  lastChangedBy: null,
  completedBy: null,
} as const;

const current: Task = {
  id: 'task-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  title: 'Buy milk',
  createdAt: '2025-01-15T10:00:00.000Z',
  openOrder: 0,
  ...lastChanged,
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

const persist: PersistTaskChange = () => okAsync(undefined);

const handlersOf = (logger: ReturnType<typeof collectLogger>['logger']) =>
  createTaskHandlers({
    persist,
    load: () => okAsync(current),
    loadList: () => okAsync(null),
    loadProject: () => okAsync(null),
    loadNextOpenOrder: () => okAsync(0),
    loadOpenInPile: () => okAsync([]),
    list: () => okAsync({ rows: [], total: 0 }),
    today: () => '2025-01-15',
    nextId: () => 'id-1',
    now: () => '2025-01-15T11:00:00.000Z',
    logger,
  });

describe('createTaskHandlers command logging', () => {
  it.each([
    ['create', (h: ReturnType<typeof handlersOf>) =>
      h.create({
        title: 'Buy milk',
        organizationId: 'org-1',
        createdById: 'user-1',
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      })],
    ['update', (h: ReturnType<typeof handlersOf>) =>
      h.update({
        id: 'task-1',
        organizationId: 'org-1',
        title: 'Oat milk',
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
      })],
    ['complete', (h: ReturnType<typeof handlersOf>) =>
      h.complete({ id: 'task-1', organizationId: 'org-1', actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const } })],
    ['uncomplete', (h: ReturnType<typeof handlersOf>) =>
      h.uncomplete({ id: 'task-1', organizationId: 'org-1', actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const } })],
    ['pin', (h: ReturnType<typeof handlersOf>) =>
      h.pin({ id: 'task-1', organizationId: 'org-1', actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const } })],
    ['unpin', (h: ReturnType<typeof handlersOf>) =>
      h.unpin({ id: 'task-1', organizationId: 'org-1', actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const } })],
    ['delete', (h: ReturnType<typeof handlersOf>) =>
      h.delete({ id: 'task-1', organizationId: 'org-1', actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const } })],
  ] as const)('logs %s exactly once', async (_name, run) => {
    const { lines, logger } = collectLogger();
    const result = await run(handlersOf(logger));
    expect(result.isOk() || result.isErr()).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.actorUserId).toBe('user-1');
    expect(lines[0]?.actorKind).toBe('user');
  });
});
