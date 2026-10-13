import { errAsync, type ResultAsync } from 'neverthrow';
import type { NoteListItem } from '@yoink/api-contracts';
import type { ListNotesQuery } from '../domain/note-queries.js';
import { projectNotFoundError, type ListNotesError } from '../domain/note-errors.js';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { projectNotesCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import type { LoadProject, NotesBackend } from './ports.js';

export type HandleListNotesDeps = {
  backend: NotesBackend;
  loadProject: LoadProject;
};

export const handleListNotes = (
  query: ListNotesQuery,
  deps: HandleListNotesDeps
): ResultAsync<ListedPage<NoteListItem>, ListNotesError> => {
  return deps.loadProject(query.projectId).andThen((project) => {
    if (!project || project.organizationId !== query.organizationId) {
      return errAsync(projectNotFoundError(query.projectId));
    }

    return runListedQuery({
      cursor: query.cursor,
      cursorOf: projectNotesCursor,
      limit: resolveListLimit(query.limit, 'pile'),
      load: (seek, fetchLimit) =>
        deps.backend.list({
          organizationId: query.organizationId,
          projectId: query.projectId,
          fetchLimit,
          seek,
        }),
    });
  });
};
