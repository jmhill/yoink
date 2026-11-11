import { describe, expect, it } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { storageError } from '../../task-management/domain/messages/project-errors.js';
import type {
  ActorName,
  LoadTimelineLookups,
  NoteSubject,
  ProjectName,
  TaskSubject,
} from '../application/ports.js';
import { createTimelineLookups } from './timeline-lookups.js';
import { timelineLookupContract } from './timeline-lookups.contract.js';

const tasks: readonly TaskSubject[] = [
  { id: 'task-open', title: 'Call Trident', deleted: false },
  { id: 'task-deleted', title: 'Old invoice', deleted: true },
];

const projects: readonly ProjectName[] = [{ id: 'project-1', name: 'Kitchen renovation' }];

const notes: readonly NoteSubject[] = [
  { id: 'note-open', title: 'Kickoff', deleted: false },
  { id: 'note-deleted', title: 'Old draft', deleted: true },
];

const actors: readonly ActorName[] = [
  { id: 'user-named', name: 'Lane' },
  { id: 'user-email', name: 'owner@example.com' },
  { id: 'user-blank', name: '' },
];

const byId = <T extends { readonly id: string }>(
  rows: readonly T[],
  ids: readonly string[]
): readonly T[] => rows.filter((row) => ids.includes(row.id));

const fakeLoad = (): LoadTimelineLookups =>
  createTimelineLookups({
    loadTaskSubjects: (ids) => okAsync(byId(tasks, ids)),
    loadProjectNames: (ids) => okAsync(byId(projects, ids)),
    loadNoteSubjects: (ids) => okAsync(byId(notes, ids)),
    loadActorNames: (ids) => okAsync(byId(actors, ids)),
  });

describe('timeline lookup ports', () => {
  timelineLookupContract(fakeLoad);

  it('fails the lookup when an owner read fails', async () => {
    const load = createTimelineLookups({
      loadTaskSubjects: () => errAsync(storageError('Failed to load task subjects')),
      loadProjectNames: () => okAsync([]),
      loadNoteSubjects: () => okAsync([]),
      loadActorNames: () => okAsync([]),
    });
    const lookups = await load({
      taskIds: ['task-open'],
      userIds: [],
      projectIds: [],
      noteIds: [],
    });

    expect(lookups.isErr()).toBe(true);
    if (lookups.isErr()) {
      expect(lookups.error.message).toBe('Failed to load task subjects');
    }
  });
});
