import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Note } from '@yoink/api-contracts';
import type { GetNoteQuery } from '../domain/note-queries.js';
import {
  noteNotFoundError,
  projectNotFoundError,
  type GetNoteError,
} from '../domain/note-errors.js';
import type { LoadProject, NotesBackend } from './ports.js';

export type HandleGetNoteDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
};

export const handleGetNote = (
  query: GetNoteQuery,
  deps: HandleGetNoteDeps
): ResultAsync<Note, GetNoteError> => {
  return deps.loadProject(query.projectId).andThen((project) => {
    if (!project || project.organizationId !== query.organizationId) {
      return errAsync(projectNotFoundError(query.projectId));
    }

    return deps
      .backend.get({
        organizationId: query.organizationId,
        projectId: query.projectId,
        noteId: query.noteId,
      })
      .andThen((loaded) => {
        if (!loaded) {
          return errAsync(noteNotFoundError(query.noteId));
        }
        return okAsync(loaded);
      });
  });
};
