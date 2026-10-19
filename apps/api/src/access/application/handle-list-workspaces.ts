import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { WorkspaceStore } from '../domain/workspace-store.js';
import {
  decideListWorkspaces,
  type ListWorkspaces,
  type WorkspaceRowInvalid,
  type WorkspaceSummary,
} from '../domain/workspace-owner-status.js';
import {
  listWorkspacesFailedError,
  type ListWorkspacesFailed,
} from '../domain/invitation-errors.js';

export type HandleListWorkspacesDeps = {
  workspaceStore: WorkspaceStore;
  now: () => string;
};

export type HandleListWorkspacesError = WorkspaceRowInvalid | ListWorkspacesFailed;

export const handleListWorkspaces = (
  query: ListWorkspaces,
  deps: HandleListWorkspacesDeps
): ResultAsync<readonly WorkspaceSummary[], HandleListWorkspacesError> => {
  return deps.workspaceStore
    .listOwnershipRows()
    .mapErr((error) => listWorkspacesFailedError(error.cause ?? error))
    .andThen((rows) => {
      const decision = decideListWorkspaces({
        query,
        rows,
        now: deps.now(),
      });
      return decision.isOk() ? okAsync(decision.value) : errAsync(decision.error);
    });
};
