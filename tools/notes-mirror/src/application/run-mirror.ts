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
  }) => Promise<Result<ImportedNote, string>>;
};

export type VaultStore = {
  listNoteFiles: () => Promise<readonly VaultFile[]>;
  writeFile: (relativePath: string, contents: string) => Promise<void>;
  moveFile: (from: string, to: string) => Promise<void>;
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
  return found?.projectName ?? 'project';
};

const applyFileAction = async (action: PlannedAction, vault: VaultStore): Promise<void> => {
  if (action.type === 'write') {
    await vault.writeFile(action.relativePath, action.markdown);
    return;
  }
  if (action.type === 'archive') {
    await vault.moveFile(action.from, action.to);
    return;
  }
  if (action.type === 'conflict') {
    await vault.moveFile(action.from, action.to);
    await vault.writeFile(action.yoinkPath, action.yoinkMarkdown);
  }
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

    for (const action of plan.actions) {
      await applyFileAction(action, deps.vault);
    }

    const afterPushes = await plan.actions.reduce<Promise<Result<MirrorState, string>>>(
      async (previous, action) => {
        const current = await previous;
        if (current.isErr()) {
          return current;
        }
        if (action.type === 'push-update') {
          const imported = await deps.api.importNote(action);
          if (imported.isErr()) {
            return err(imported.error);
          }
          const note = trackedFromImported(
            imported.value,
            projectNameOf(current.value, action.projectId)
          );
          await deps.vault.writeFile(note.relativePath, noteToMarkdown({
            id: note.noteId,
            projectId: note.projectId,
            version: note.version,
            updatedAt: note.updatedAt,
            title: note.title,
            body: note.body,
          }));
          return ok({
            ...current.value,
            notes: { ...current.value.notes, [note.noteId]: note },
          });
        }
        if (action.type === 'push-create') {
          const imported = await deps.api.importNote(action);
          if (imported.isErr()) {
            return err(imported.error);
          }
          const note = trackedFromImported(
            imported.value,
            projectNameOf(current.value, action.projectId)
          );
          await deps.vault.writeFile(note.relativePath, noteToMarkdown({
            id: note.noteId,
            projectId: note.projectId,
            version: note.version,
            updatedAt: note.updatedAt,
            title: note.title,
            body: note.body,
          }));
          return ok({
            ...current.value,
            notes: { ...current.value.notes, [note.noteId]: note },
          });
        }
        return current;
      },
      Promise.resolve(ok(plan.nextState))
    );

    if (afterPushes.isErr()) {
      return err(afterPushes.error);
    }

    const nextActions = [...collected, ...plan.actions];
    if (page.value.hasMore && page.value.nextCursor) {
      return walk(afterPushes.value, page.value.nextCursor, nextActions);
    }
    return ok({ state: afterPushes.value, actions: nextActions });
  };

  const finished = await walk(initial, undefined, []);
  if (finished.isErr()) {
    return err(finished.error);
  }
  await deps.state.save(finished.value.state);
  return ok({
    actions: finished.value.actions,
    warnings: finished.value.actions
      .filter((action) => action.type === 'report' || action.type === 'flag-obsidian-delete' || action.type === 'conflict')
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
