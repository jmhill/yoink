import { describe, it, expect } from 'vitest';
import { decideCreateProject } from './decide-create.js';
import type { CreateProjectCommand } from './project-commands.js';

const personCommand = (): CreateProjectCommand => ({
  name: 'Garden',
  organizationId: 'org-123',
  createdById: 'user-456',
  actor: { kind: 'user', userId: 'user-456', via: 'session' },
});

const botCommand = (): CreateProjectCommand => ({
  name: 'Garden',
  organizationId: 'org-123',
  createdById: 'user-lane',
  actor: { kind: 'bot', userId: 'user-lane', tokenId: 'tok-lane', name: 'Lane', via: 'token' },
});

describe('decideCreateProject', () => {
  it('decides a ProjectCreated fact as active with generated id and timestamp', () => {
    const result = decideCreateProject({
      command: personCommand(),
      existingNames: [],
      id: 'project-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'ProjectCreated',
        id: 'project-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        name: 'Garden',
        status: 'active',
        createdAt: '2025-01-15T10:00:00.000Z',
        occurredAt: '2025-01-15T10:00:00.000Z',
      });
    }
  });

  it('includes a trimmed optional objective', () => {
    const result = decideCreateProject({
      command: { ...personCommand(), objective: '  Grow tomatoes  ' },
      existingNames: [],
      id: 'project-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.objective).toBe('Grow tomatoes');
    }
  });

  it('treats a blank objective as absent', () => {
    const result = decideCreateProject({
      command: { ...personCommand(), objective: '   ' },
      existingNames: [],
      id: 'project-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.objective).toBeUndefined();
    }
  });

  it('trims surrounding whitespace from the name', () => {
    const result = decideCreateProject({
      command: { ...personCommand(), name: '  Garden  ' },
      existingNames: [],
      id: 'project-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.name).toBe('Garden');
    }
  });

  it('rejects an empty name', () => {
    const result = decideCreateProject({
      command: { ...personCommand(), name: '' },
      existingNames: [],
      id: 'project-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_PROJECT_NAME');
    }
  });

  it('rejects a whitespace-only name', () => {
    const result = decideCreateProject({
      command: { ...personCommand(), name: '   ' },
      existingNames: [],
      id: 'project-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_PROJECT_NAME');
    }
  });

  it('rejects a name over 200 characters', () => {
    const result = decideCreateProject({
      command: { ...personCommand(), name: 'a'.repeat(201) },
      existingNames: [],
      id: 'project-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_PROJECT_NAME');
    }
  });

  it('accepts a name at exactly 200 characters', () => {
    const name = 'a'.repeat(200);
    const result = decideCreateProject({
      command: { ...personCommand(), name },
      existingNames: [],
      id: 'project-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.name).toBe(name);
    }
  });

  it('rejects a name already used among projects in the organization', () => {
    const result = decideCreateProject({
      command: personCommand(),
      existingNames: ['Garden'],
      id: 'project-id-2',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_PROJECT_NAME');
    }
  });

  it('rejects a name that matches an existing project ignoring case', () => {
    const result = decideCreateProject({
      command: { ...personCommand(), name: 'garden' },
      existingNames: ['Garden'],
      id: 'project-id-2',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_PROJECT_NAME');
    }
  });

  it('allows the same name as a list — uniqueness is among projects only', () => {
    const result = decideCreateProject({
      command: personCommand(),
      existingNames: [],
      id: 'project-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
  });

  it('allows a person token', () => {
    const result = decideCreateProject({
      command: {
        ...personCommand(),
        actor: { kind: 'user', userId: 'user-456', via: 'token' },
      },
      existingNames: [],
      id: 'project-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
  });

  it('refuses a bot actor', () => {
    const result = decideCreateProject({
      command: botCommand(),
      existingNames: [],
      id: 'project-id-1',
      now: '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('PROJECT_CREATE_REQUIRES_PERSON');
    }
  });
});
