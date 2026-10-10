import { describe, it, expect } from 'vitest';
import {
  ChangeProjectStatusSchema,
  CreateProjectSchema,
  ProjectSchema,
  UpdateProjectSchema,
} from './project.js';

const garden = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Garden',
  status: 'active' as const,
  waitingOn: null,
  waitingSince: null,
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: '2025-01-15T10:00:00.000Z',
  lastChangedBy: '550e8400-e29b-41d4-a716-446655440002',
};

describe('ProjectSchema', () => {
  it('accepts a project without an objective', () => {
    expect(ProjectSchema.safeParse(garden).success).toBe(true);
  });

  it('accepts an optional objective and lastChanged nulls', () => {
    const parsed = ProjectSchema.safeParse({
      ...garden,
      objective: 'Grow tomatoes',
      lastChangedAt: null,
      lastChangedBy: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts every status', () => {
    for (const status of ['active', 'waiting', 'someday', 'done', 'proposed'] as const) {
      expect(ProjectSchema.safeParse({ ...garden, status }).success).toBe(true);
    }
  });

  it('accepts waiting on and a date or unknown since', () => {
    expect(
      ProjectSchema.safeParse({
        ...garden,
        status: 'waiting',
        waitingOn: 'Mike',
        waitingSince: '2026-10-01',
      }).success
    ).toBe(true);
    expect(
      ProjectSchema.safeParse({
        ...garden,
        status: 'waiting',
        waitingOn: 'Trident',
        waitingSince: null,
      }).success
    ).toBe(true);
  });
});

describe('CreateProjectSchema', () => {
  it('trims the name and allows a missing objective', () => {
    const parsed = CreateProjectSchema.safeParse({ name: '  Garden  ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe('Garden');
      expect(parsed.data.objective).toBeUndefined();
    }
  });

  it('rejects a blank name', () => {
    expect(CreateProjectSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});

describe('UpdateProjectSchema', () => {
  it('accepts name, objective, or both', () => {
    expect(UpdateProjectSchema.safeParse({ name: 'Backyard' }).success).toBe(true);
    expect(UpdateProjectSchema.safeParse({ objective: 'Plant herbs' }).success).toBe(true);
    expect(UpdateProjectSchema.safeParse({ objective: null }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(UpdateProjectSchema.safeParse({}).success).toBe(false);
  });
});

describe('ChangeProjectStatusSchema', () => {
  it('accepts assignable statuses and optional waiting fields', () => {
    expect(ChangeProjectStatusSchema.safeParse({ status: 'active' }).success).toBe(true);
    expect(
      ChangeProjectStatusSchema.safeParse({
        status: 'waiting',
        waitingOn: 'Mike',
        waitingSince: '2026-10-10',
      }).success
    ).toBe(true);
    expect(
      ChangeProjectStatusSchema.safeParse({
        status: 'waiting',
        waitingOn: 'Trident',
        waitingSince: null,
      }).success
    ).toBe(true);
    expect(
      ChangeProjectStatusSchema.safeParse({
        status: 'done',
        openTasks: 'complete',
      }).success
    ).toBe(true);
  });

  it('refuses proposed as a target status', () => {
    expect(ChangeProjectStatusSchema.safeParse({ status: 'proposed' }).success).toBe(false);
  });
});
