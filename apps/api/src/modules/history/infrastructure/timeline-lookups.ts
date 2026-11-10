import { ResultAsync } from 'neverthrow';
import type {
  LoadActorNames,
  LoadNoteSubjects,
  LoadProjectNames,
  LoadTaskSubjects,
  LoadTimelineLookups,
} from '../application/ports.js';
import { UNKNOWN_ACTOR_NAME, type TimelineLookups } from '../domain/to-timeline-entry.js';

export type TimelineLookupPorts = {
  readonly loadTaskSubjects: LoadTaskSubjects;
  readonly loadProjectNames: LoadProjectNames;
  readonly loadNoteSubjects: LoadNoteSubjects;
  readonly loadActorNames: LoadActorNames;
};

const missingSubject = { title: null, deleted: false } as const;

/**
 * Combines owner facts into the timeline lookup. A missing subject stays a
 * null title and not deleted. A missing actor stays Unknown.
 */
export const createTimelineLookups =
  (ports: TimelineLookupPorts): LoadTimelineLookups =>
  (ids) =>
    ResultAsync.combine([
      ports.loadTaskSubjects(ids.taskIds),
      ports.loadProjectNames(ids.projectIds),
      ports.loadNoteSubjects(ids.noteIds),
      ports.loadActorNames(ids.userIds),
    ]).map(([tasks, projects, notes, actors]): TimelineLookups => {
      const taskById = new Map(tasks.map((task) => [task.id, task]));
      const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
      const noteById = new Map(notes.map((note) => [note.id, note]));
      const actorNameById = new Map(actors.map((actor) => [actor.id, actor.name]));

      return {
        subjectOf: (type, id) => {
          if (type === 'task') {
            const found = taskById.get(id);
            return found ? { title: found.title, deleted: found.deleted } : missingSubject;
          }
          if (type === 'note') {
            const found = noteById.get(id);
            return found ? { title: found.title, deleted: found.deleted } : missingSubject;
          }
          const name = projectNameById.get(id);
          return { title: name ?? null, deleted: false };
        },
        taskTitleOf: (id) => taskById.get(id)?.title ?? null,
        actorNameOf: (userId) =>
          userId ? (actorNameById.get(userId) ?? UNKNOWN_ACTOR_NAME) : UNKNOWN_ACTOR_NAME,
      };
    });
