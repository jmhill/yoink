import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import { createProjectHandlers } from './create-project-handlers.js';
import type { CommandLogFields } from '../../shared/change-log/application/command-log.js';
import type { PersistProjectChange } from './ports.js';

const garden: Project = {
  id: 'project-1',
  organizationId: 'org-1',
  createdById: 'user-1',
  name: 'Garden',
  status: 'active',
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: '2025-01-15T10:00:00.000Z',
  lastChangedBy: 'user-1',
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

const persist: PersistProjectChange = () => okAsync(undefined);

const handlersOf = (logger: ReturnType<typeof collectLogger>['logger']) =>
  createProjectHandlers({
    persist,
    list: () => okAsync([garden]),
    pageProjects: () => okAsync({ rows: [garden], total: 1 }),
    load: () => okAsync(garden),
    pageOpenTasksOnProject: () => okAsync({ rows: [], total: 0 }),
    nextId: () => 'id-1',
    now: () => '2025-01-15T11:00:00.000Z',
    logger,
  });

describe('createProjectHandlers command logging', () => {
  it('logs create exactly once', async () => {
    const { lines, logger } = collectLogger();
    const result = await handlersOf(logger).create({
      name: 'Cabin',
      organizationId: 'org-1',
      createdById: 'user-1',
      actor: { kind: 'user', userId: 'user-1', via: 'session' },
    });
    expect(result.isOk()).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.command).toBe('CreateProject');
    expect(lines[0]?.eventKinds).toEqual(['ProjectCreated']);
  });

  it('logs update exactly once', async () => {
    const { lines, logger } = collectLogger();
    const result = await handlersOf(logger).update({
      id: 'project-1',
      organizationId: 'org-1',
      name: 'Backyard',
      actor: { kind: 'user', userId: 'user-1', via: 'session' },
    });
    expect(result.isOk()).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.command).toBe('UpdateProject');
  });

  it('logs a bot refusal on create', async () => {
    const { lines, logger } = collectLogger();
    const result = await handlersOf(logger).create({
      name: 'Cabin',
      organizationId: 'org-1',
      createdById: 'user-lane',
      actor: { kind: 'bot', userId: 'user-lane', tokenId: 'tok-lane', name: 'Lane', via: 'token' },
    });
    expect(result.isErr()).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.errorType).toBe('PROJECT_CREATE_REQUIRES_PERSON');
  });
});
