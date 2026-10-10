import { describe, it, expect } from 'vitest';
import type { Project } from '@yoink/api-contracts';
import { decideUpdateProject } from './decide-update.js';
import type { UpdateProjectCommand } from './project-commands.js';

const garden: Project = {
  id: 'project-garden',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'garden',
  status: 'active',
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: '2025-01-15T10:00:00.000Z',
  lastChangedBy: 'user-456',
};

const person = (overrides: Partial<UpdateProjectCommand> = {}): UpdateProjectCommand => ({
  id: garden.id,
  organizationId: garden.organizationId,
  name: 'Backyard',
  actor: { kind: 'user', userId: 'user-456', via: 'session' },
  ...overrides,
});

const bot = (overrides: Partial<UpdateProjectCommand> = {}): UpdateProjectCommand => ({
  id: garden.id,
  organizationId: garden.organizationId,
  name: 'Backyard',
  actor: { kind: 'bot', userId: 'user-lane', tokenId: 'tok-lane', name: 'Lane', via: 'token' },
  ...overrides,
});

describe('decideUpdateProject', () => {
  it('decides a ProjectUpdated fact with the trimmed name', () => {
    const result = decideUpdateProject({
      command: person({ name: '  Backyard  ' }),
      current: garden,
      existingNames: [garden.name, 'Cabin'],
      now: '2025-01-15T11:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'changed',
        event: {
          type: 'ProjectUpdated',
          id: 'project-garden',
          organizationId: 'org-123',
          name: 'Backyard',
          occurredAt: '2025-01-15T11:00:00.000Z',
        },
      });
    }
  });

  it('lets a bot edit name and objective', () => {
    const result = decideUpdateProject({
      command: bot({ name: 'Backyard', objective: 'Plant herbs' }),
      current: garden,
      existingNames: [garden.name],
      now: '2025-01-15T11:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'changed') {
      expect(result.value.event.name).toBe('Backyard');
      expect(result.value.event.objective).toBe('Plant herbs');
    }
  });

  it('clears a blank objective', () => {
    const result = decideUpdateProject({
      command: person({ name: undefined, objective: '   ' }),
      current: { ...garden, objective: 'Grow tomatoes' },
      existingNames: [garden.name],
      now: '2025-01-15T11:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'changed') {
      expect(result.value.event.objective).toBeNull();
      expect(result.value.event.name).toBeUndefined();
    }
  });

  it('includes only the fields that actually changed', () => {
    const result = decideUpdateProject({
      command: person({ name: garden.name, objective: 'Plant herbs' }),
      current: garden,
      existingNames: [garden.name],
      now: '2025-01-15T11:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'changed') {
      expect(result.value.event.name).toBeUndefined();
      expect(result.value.event.objective).toBe('Plant herbs');
    }
  });

  it('returns unchanged when nothing changed', () => {
    const result = decideUpdateProject({
      command: person({ name: garden.name, objective: garden.objective ?? null }),
      current: garden,
      existingNames: [garden.name],
      now: '2025-01-15T11:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ type: 'unchanged' });
    }
  });

  it('excludes the current name so capitalization-only is allowed', () => {
    const result = decideUpdateProject({
      command: person({ name: 'Garden' }),
      current: garden,
      existingNames: [garden.name],
      now: '2025-01-15T11:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'changed') {
      expect(result.value.event.name).toBe('Garden');
    }
  });

  it('rejects a duplicate name ignoring case', () => {
    const result = decideUpdateProject({
      command: person({ name: 'cabin' }),
      current: garden,
      existingNames: [garden.name, 'Cabin'],
      now: '2025-01-15T11:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_PROJECT_NAME');
    }
  });

  it('rejects an empty name', () => {
    const result = decideUpdateProject({
      command: person({ name: '   ' }),
      current: garden,
      existingNames: [garden.name],
      now: '2025-01-15T11:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_PROJECT_NAME');
    }
  });
});
