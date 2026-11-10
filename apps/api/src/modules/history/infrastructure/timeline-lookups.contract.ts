import { expect, it } from 'vitest';
import { UNKNOWN_ACTOR_NAME } from '../domain/to-timeline-entry.js';
import type { LoadTimelineLookups } from '../application/ports.js';

/** Same name-lookup cases for the sqlite adapters and the in-memory ports. */
export const timelineLookupContract = (load: () => LoadTimelineLookups): void => {
  it('loads task, user, and project names, and keeps a missing subject untitled', async () => {
    const lookups = await load()({
      taskIds: ['task-open', 'task-deleted', 'task-missing'],
      userIds: ['user-named', 'user-email', 'user-blank', 'user-missing'],
      projectIds: ['project-1', 'project-missing'],
      noteIds: [],
    });

    expect(lookups.isOk()).toBe(true);
    if (!lookups.isOk()) {
      return;
    }
    expect(lookups.value.subjectOf('task', 'task-open')).toEqual({
      title: 'Call Trident',
      deleted: false,
    });
    expect(lookups.value.subjectOf('task', 'task-deleted')).toEqual({
      title: 'Old invoice',
      deleted: true,
    });
    expect(lookups.value.subjectOf('task', 'task-missing')).toEqual({
      title: null,
      deleted: false,
    });
    expect(lookups.value.taskTitleOf('task-open')).toBe('Call Trident');
    expect(lookups.value.taskTitleOf('task-deleted')).toBe('Old invoice');
    expect(lookups.value.taskTitleOf('task-missing')).toBeNull();
    expect(lookups.value.subjectOf('project', 'project-1')).toEqual({
      title: 'Kitchen renovation',
      deleted: false,
    });
    expect(lookups.value.subjectOf('project', 'project-missing')).toEqual({
      title: null,
      deleted: false,
    });
    expect(lookups.value.actorNameOf('user-named')).toBe('Lane');
    expect(lookups.value.actorNameOf('user-email')).toBe('owner@example.com');
    expect(lookups.value.actorNameOf('user-blank')).toBe('');
    expect(lookups.value.actorNameOf('user-missing')).toBe(UNKNOWN_ACTOR_NAME);
    expect(lookups.value.actorNameOf(null)).toBe(UNKNOWN_ACTOR_NAME);
  });

  it('loads note titles, including a soft-deleted note', async () => {
    const lookups = await load()({
      taskIds: [],
      userIds: [],
      projectIds: [],
      noteIds: ['note-open', 'note-deleted', 'note-missing'],
    });

    expect(lookups.isOk()).toBe(true);
    if (!lookups.isOk()) {
      return;
    }
    expect(lookups.value.subjectOf('note', 'note-open')).toEqual({
      title: 'Kickoff',
      deleted: false,
    });
    expect(lookups.value.subjectOf('note', 'note-deleted')).toEqual({
      title: 'Old draft',
      deleted: true,
    });
    expect(lookups.value.subjectOf('note', 'note-missing')).toEqual({
      title: null,
      deleted: false,
    });
  });

  it('returns empty lookups when no ids were requested', async () => {
    const lookups = await load()({
      taskIds: [],
      userIds: [],
      projectIds: [],
      noteIds: [],
    });

    expect(lookups.isOk()).toBe(true);
    if (!lookups.isOk()) {
      return;
    }
    expect(lookups.value.subjectOf('task', 'task-open')).toEqual({
      title: null,
      deleted: false,
    });
    expect(lookups.value.actorNameOf('user-named')).toBe(UNKNOWN_ACTOR_NAME);
  });
};
