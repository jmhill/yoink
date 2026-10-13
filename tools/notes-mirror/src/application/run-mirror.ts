import { err, ok, type Result } from 'neverthrow';
import {
  emptyMirrorState,
  planMirrorPass,
  type FeedChange,
  type MirrorState,
  type PlannedAction,
  type TrackedNote,
  type VaultFile,
} from '../domain/plan-mirror-pass.js';
import { noteToMarkdown } from '../domain/note-markdown.js';
import { vaultNotePath } from '../domain/vault-path.js';

export type ImportedNote = {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly body: string;
  readonly version: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ChangedPage = {
  readonly changes: readonly FeedChange[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type ImportFailure =
  | { readonly type: 'NOTE_SYNC_CONFLICT'; readonly message: string }
  | { readonly type: 'failed'; readonly message: string };

export type VaultMoveError =
  | { readonly type: 'SOURCE_MISSING'; readonly from: string }
  | { readonly type: 'MOVE_FAILED'; readonly from: string; readonly to: string; readonly message: string };

export type NotesMirrorApi = {
  listChanged: (input: {
    since: string;
    cursor?: string;
  }) => Promise<Result<ChangedPage, string>>;
  importNote: (input: {
    projectId: string;
    noteId?: string;
    title: string;
    body: string;
    baseVersion?: string;
  }) => Promise<Result<ImportedNote, ImportFailure>>;
};

export type VaultStore = {
  listNoteFiles: () => Promise<readonly VaultFile[]>;
  writeFile: (relativePath: string, contents: string) => Promise<void>;
  moveFile: (from: string, to: string) => Promise<Result<void, VaultMoveError>>;
};

export type StateStore = {
  load: () => Promise<MirrorState>;
  save: (state: MirrorState) => Promise<void>;
};

export type MirrorReport = {
  readonly actions: readonly PlannedAction[];
  readonly warnings: readonly string[];
};

const trackedFromImported = (note: ImportedNote, projectName: string): TrackedNote => ({
  noteId: note.id,
  relativePath: vaultNotePath({
    projectName,
    projectId: note.projectId,
    createdAt: note.createdAt,
    noteId: note.id,
  }),
  version: note.version,
  title: note.title,
  body: note.body,
  projectId: note.projectId,
  projectName,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

const projectNameOf = (state: MirrorState, projectId: string): string => {
  const found = Object.values(state.notes).find((note) => note.projectId === projectId);
  return found?.projectName ?? projectId;
};

const markdownFor = (note: TrackedNote): string =>
  noteToMarkdown({
    id: note.noteId,
    projectId: note.projectId,
    version: note.version,
    updatedAt: note.updatedAt,
    title: note.title,
    body: note.body,
  });

const relocate = async (
  vault: VaultStore,
  from: string,
  to: string
): Promise<Result<void, VaultMoveError>> => {
  if (from === to) {
    return ok(undefined);
  }
  return vault.moveFile(from, to);
};

const applyFileAction = async (
  action: PlannedAction,
  vault: VaultStore
): Promise<Result<void, VaultMoveError>> => {
  if (action.type === 'write') {
    await vault.writeFile(action.relativePath, action.markdown);
    return ok(undefined);
  }
  if (action.type === 'move') {
    return relocate(vault, action.from, action.to);
  }
  if (action.type === 'archive') {
    return relocate(vault, action.from, action.to);
  }
  if (action.type === 'conflict') {
    const moved = await relocate(vault, action.from, action.to);
    if (moved.isErr() && moved.error.type !== 'SOURCE_MISSING') {
      return moved;
    }
    await vault.writeFile(action.yoinkPath, action.yoinkMarkdown);
    return ok(undefined);
  }
  return ok(undefined);
};

const writeImported = async (
  vault: VaultStore,
  note: TrackedNote,
  currentPath: string
): Promise<Result<void, VaultMoveError>> => {
  const moved = await relocate(vault, currentPath, note.relativePath);
  if (moved.isErr() && moved.error.type !== 'SOURCE_MISSING') {
    return moved;
  }
  await vault.writeFile(note.relativePath, markdownFor(note));
  return ok(undefined);
};

type PushState = {
  readonly state: MirrorState;
  readonly extras: readonly PlannedAction[];
};

export const runMirror = async (deps: {
  api: NotesMirrorApi;
  vault: VaultStore;
  state: StateStore;
}): Promise<Result<MirrorReport, string>> => {
  const starting = await deps.state.load();
  const initial = starting.notes ? starting : emptyMirrorState();

  const walk = async (
    state: MirrorState,
    cursor: string | undefined,
    collected: readonly PlannedAction[]
  ): Promise<Result<{ state: MirrorState; actions: readonly PlannedAction[] }, string>> => {
    const page = await deps.api.listChanged({ since: state.lastSince, cursor });
    if (page.isErr()) {
      return err(page.error);
    }
    const vaultFiles = await deps.vault.listNoteFiles();
    const plan = planMirrorPass({
      state,
      changes: page.value.changes,
      vaultFiles,
    });

    const afterFiles = await plan.actions.reduce<Promise<Result<readonly PlannedAction[], string>>>(
      async (previous, action) => {
        const current = await previous;
        if (current.isErr()) {
          return current;
        }
        const applied = await applyFileAction(action, deps.vault);
        if (applied.isOk()) {
          return ok(current.value);
        }
        if (applied.error.type === 'SOURCE_MISSING') {
          return ok([
            ...current.value,
            {
              type: 'report' as const,
              level: 'warn' as const,
              message: `Skipped move of missing file ${applied.error.from}`,
            },
          ]);
        }
        return err(applied.error.message);
      },
      Promise.resolve(ok<readonly PlannedAction[], string>([]))
    );
    if (afterFiles.isErr()) {
      return err(afterFiles.error);
    }

    const afterPushes = await plan.actions.reduce<Promise<Result<PushState, string>>>(
      async (previous, action) => {
        const current = await previous;
        if (current.isErr()) {
          return current;
        }
        if (action.type !== 'push-update' && action.type !== 'push-create') {
          return current;
        }
        const imported = await deps.api.importNote(action);
        if (imported.isErr()) {
          if (imported.error.type === 'NOTE_SYNC_CONFLICT') {
            return ok({
              state: current.value.state,
              extras: [
                ...current.value.extras,
                {
                  type: 'report' as const,
                  level: 'warn' as const,
                  message: `Conflict on ${action.type === 'push-update' ? action.noteId : action.relativePath}; left Yoink as-is and continued`,
                },
              ],
            });
          }
          return err(imported.error.message);
        }
        const note = trackedFromImported(
          imported.value,
          projectNameOf(current.value.state, action.projectId)
        );
        const currentPath = action.type === 'push-create' ? action.relativePath : action.currentPath;
        const written = await writeImported(deps.vault, note, currentPath);
        if (written.isErr() && written.error.type !== 'SOURCE_MISSING') {
          return err(written.error.message);
        }
        return ok({
          state: {
            ...current.value.state,
            notes: { ...current.value.state.notes, [note.noteId]: note },
          },
          extras: current.value.extras,
        });
      },
      Promise.resolve(ok<PushState, string>({ state: plan.nextState, extras: afterFiles.value }))
    );

    if (afterPushes.isErr()) {
      return err(afterPushes.error);
    }

    const nextActions = [...collected, ...plan.actions, ...afterPushes.value.extras];
    if (page.value.hasMore && page.value.nextCursor) {
      return walk(afterPushes.value.state, page.value.nextCursor, nextActions);
    }
    return ok({ state: afterPushes.value.state, actions: nextActions });
  };

  const finished = await walk(initial, undefined, []);
  if (finished.isErr()) {
    return err(finished.error);
  }
  await deps.state.save(finished.value.state);
  return ok({
    actions: finished.value.actions,
    warnings: finished.value.actions
      .filter(
        (action) =>
          action.type === 'report' || action.type === 'flag-obsidian-delete' || action.type === 'conflict'
      )
      .map((action) => {
        if (action.type === 'report') {
          return action.message;
        }
        if (action.type === 'flag-obsidian-delete') {
          return `Obsidian deleted ${action.relativePath}; Yoink still has note ${action.noteId}`;
        }
        return `Conflict on ${action.from}; vault copy moved to ${action.to}`;
      }),
  });
};
