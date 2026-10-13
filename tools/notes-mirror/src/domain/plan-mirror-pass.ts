import { markdownToNote, noteToMarkdown } from './note-markdown.js';
import {
  projectFolderFromPath,
  safeProjectFolderName,
  vaultArchivePath,
  vaultNotePath,
  vaultSyncConflictPath,
} from './vault-path.js';

export type UpsertedChange = {
  readonly kind: 'upserted';
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly title: string;
  readonly body: string;
  readonly version: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type DeletedChange = {
  readonly kind: 'deleted';
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly createdAt: string;
  readonly deletedAt: string;
};

export type FeedChange = UpsertedChange | DeletedChange;

export type TrackedNote = {
  readonly noteId: string;
  readonly relativePath: string;
  readonly version: string;
  readonly title: string;
  readonly body: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MirrorState = {
  readonly lastSince: string;
  readonly lastNoteId: string | null;
  readonly notes: Readonly<Record<string, TrackedNote>>;
};

export type VaultFile = {
  readonly relativePath: string;
  readonly markdown: string;
};

export type PlannedAction =
  | { readonly type: 'write'; readonly relativePath: string; readonly markdown: string; readonly note: TrackedNote }
  | { readonly type: 'archive'; readonly from: string; readonly to: string; readonly noteId: string }
  | {
      readonly type: 'conflict';
      readonly from: string;
      readonly to: string;
      readonly yoinkPath: string;
      readonly yoinkMarkdown: string;
      readonly note: TrackedNote;
    }
  | { readonly type: 'flag-obsidian-delete'; readonly noteId: string; readonly relativePath: string }
  | {
      readonly type: 'push-update';
      readonly projectId: string;
      readonly noteId: string;
      readonly title: string;
      readonly body: string;
      readonly baseVersion: string;
    }
  | {
      readonly type: 'push-create';
      readonly projectId: string;
      readonly title: string;
      readonly body: string;
      readonly relativePath: string;
    }
  | { readonly type: 'report'; readonly level: 'info' | 'warn'; readonly message: string };

export type MirrorPlan = {
  readonly actions: readonly PlannedAction[];
  readonly nextState: MirrorState;
};

export const emptyMirrorState = (): MirrorState => ({
  lastSince: '1970-01-01T00:00:00.000Z',
  lastNoteId: null,
  notes: {},
});

const sameContent = (
  left: { title: string; body: string },
  right: { title: string; body: string }
): boolean => left.title === right.title && left.body === right.body;

const trackedFromUpsert = (change: UpsertedChange): TrackedNote => ({
  noteId: change.id,
  relativePath: vaultNotePath({
    projectName: change.projectName,
    createdAt: change.createdAt,
    noteId: change.id,
  }),
  version: change.version,
  title: change.title,
  body: change.body,
  projectId: change.projectId,
  projectName: change.projectName,
  createdAt: change.createdAt,
  updatedAt: change.updatedAt,
});

const writeAction = (note: TrackedNote): PlannedAction => ({
  type: 'write',
  relativePath: note.relativePath,
  markdown: noteToMarkdown({
    id: note.noteId,
    projectId: note.projectId,
    version: note.version,
    updatedAt: note.updatedAt,
    title: note.title,
    body: note.body,
  }),
  note,
});

const setNote = (notes: Readonly<Record<string, TrackedNote>>, note: TrackedNote) => ({
  ...notes,
  [note.noteId]: note,
});

const omitNote = (
  notes: Readonly<Record<string, TrackedNote>>,
  noteId: string
): Readonly<Record<string, TrackedNote>> =>
  Object.fromEntries(Object.entries(notes).filter(([id]) => id !== noteId));

const projectIdByFolder = (notes: Readonly<Record<string, TrackedNote>>): Readonly<Record<string, string>> =>
  Object.values(notes).reduce<Readonly<Record<string, string>>>((acc, note) => {
    const folder = safeProjectFolderName(note.projectName);
    return { ...acc, [folder]: note.projectId };
  }, {});

type PlanState = {
  readonly actions: readonly PlannedAction[];
  readonly notes: Readonly<Record<string, TrackedNote>>;
  readonly seen: ReadonlySet<string>;
};

const withAction = (state: PlanState, action: PlannedAction): PlanState => ({
  ...state,
  actions: [...state.actions, action],
});

const planUpsert = (state: PlanState, change: UpsertedChange, vaultByNoteId: ReadonlyMap<string, VaultFile>): PlanState => {
  const note = trackedFromUpsert(change);
  const vault = vaultByNoteId.get(change.id);
  const tracked = state.notes[change.id];
  const parsed = vault ? markdownToNote(vault.markdown) : null;
  const local = parsed?.isOk() ? parsed.value : null;
  const lastSynced = tracked ?? null;
  const localDirty =
    local !== null &&
    (lastSynced !== null ? !sameContent(local, lastSynced) : !sameContent(local, change));

  if (localDirty && !sameContent(local, change)) {
    const baseVersion = local.version;
    if (baseVersion === change.version) {
      return {
        ...withAction(state, {
          type: 'push-update',
          projectId: change.projectId,
          noteId: change.id,
          title: local.title,
          body: local.body,
          baseVersion,
        }),
        seen: new Set([...state.seen, change.id]),
        notes: setNote(state.notes, {
          ...note,
          title: local.title,
          body: local.body,
          version: local.version,
        }),
      };
    }
    return {
      ...withAction(state, {
        type: 'conflict',
        from: vault?.relativePath ?? note.relativePath,
        to: vaultSyncConflictPath({
          createdAt: change.createdAt,
          noteId: change.id,
          conflictedAt: change.updatedAt,
        }),
        yoinkPath: note.relativePath,
        yoinkMarkdown: noteToMarkdown({
          id: change.id,
          projectId: change.projectId,
          version: change.version,
          updatedAt: change.updatedAt,
          title: change.title,
          body: change.body,
        }),
        note,
      }),
      seen: new Set([...state.seen, change.id]),
      notes: setNote(state.notes, note),
    };
  }

  return {
    ...withAction(state, writeAction(note)),
    seen: new Set([...state.seen, change.id]),
    notes: setNote(state.notes, note),
  };
};

const planDelete = (
  state: PlanState,
  change: DeletedChange,
  vaultByNoteId: ReadonlyMap<string, VaultFile>
): PlanState => {
  const tracked = state.notes[change.id];
  const vault = vaultByNoteId.get(change.id);
  const from =
    vault?.relativePath ??
    tracked?.relativePath ??
    vaultNotePath({
      projectName: change.projectName,
      createdAt: change.createdAt,
      noteId: change.id,
    });
  return {
    ...withAction(state, {
      type: 'archive',
      from,
      to: vaultArchivePath(from),
      noteId: change.id,
    }),
    seen: new Set([...state.seen, change.id]),
    notes: omitNote(state.notes, change.id),
  };
};

const planVaultOnly = (
  state: PlanState,
  file: VaultFile,
  folders: Readonly<Record<string, string>>
): PlanState => {
  const parsed = markdownToNote(file.markdown);
  if (parsed.isOk()) {
    if (state.seen.has(parsed.value.id)) {
      return state;
    }
    const tracked = state.notes[parsed.value.id];
    if (tracked && !sameContent(parsed.value, tracked)) {
      return withAction(state, {
        type: 'push-update',
        projectId: tracked.projectId,
        noteId: parsed.value.id,
        title: parsed.value.title,
        body: parsed.value.body,
        baseVersion: tracked.version,
      });
    }
    return state;
  }

  const folder = projectFolderFromPath(file.relativePath);
  const projectId = folder ? folders[folder] : undefined;
  if (!projectId) {
    return withAction(state, {
      type: 'report',
      level: 'warn',
      message: `Skipped ${file.relativePath}: no Yoink project matches that folder`,
    });
  }

  const lines = file.markdown.replace(/\r\n/g, '\n').split('\n');
  const titleLine = lines.find((line) => line.startsWith('# '));
  const title = titleLine ? titleLine.slice(2).trim() : '';
  if (title.length === 0) {
    return withAction(state, {
      type: 'report',
      level: 'warn',
      message: `Skipped ${file.relativePath}: new Obsidian note needs a "# title" line`,
    });
  }
  const titleIndex = titleLine ? lines.indexOf(titleLine) : -1;
  const after = titleIndex >= 0 ? lines.slice(titleIndex + 1) : [];
  const body = after[0] === '' ? after.slice(1).join('\n') : after.join('\n');
  return withAction(state, {
    type: 'push-create',
    projectId,
    title,
    body,
    relativePath: file.relativePath,
  });
};

const lastChangeStamp = (
  changes: readonly FeedChange[]
): { lastSince: string; lastNoteId: string | null } | null => {
  const last = changes[changes.length - 1];
  if (!last) {
    return null;
  }
  if (last.kind === 'upserted') {
    return { lastSince: last.updatedAt, lastNoteId: last.id };
  }
  return { lastSince: last.deletedAt, lastNoteId: last.id };
};

export const planMirrorPass = (input: {
  state: MirrorState;
  changes: readonly FeedChange[];
  vaultFiles: readonly VaultFile[];
}): MirrorPlan => {
  const vaultByNoteId = new Map(
    input.vaultFiles.flatMap((file) => {
      const parsed = markdownToNote(file.markdown);
      return parsed.isOk() ? ([[parsed.value.id, file]] as const) : [];
    })
  );

  const afterFeed = input.changes.reduce<PlanState>(
    (state, change) =>
      change.kind === 'deleted'
        ? planDelete(state, change, vaultByNoteId)
        : planUpsert(state, change, vaultByNoteId),
    { actions: [], notes: input.state.notes, seen: new Set() }
  );

  const folders = projectIdByFolder(afterFeed.notes);
  const afterVault = input.vaultFiles.reduce<PlanState>(
    (state, file) => planVaultOnly(state, file, folders),
    afterFeed
  );

  const missingLocal = Object.values(afterVault.notes).reduce<PlanState>((state, tracked) => {
    if (state.seen.has(tracked.noteId) || vaultByNoteId.has(tracked.noteId)) {
      return state;
    }
    return withAction(state, {
      type: 'flag-obsidian-delete',
      noteId: tracked.noteId,
      relativePath: tracked.relativePath,
    });
  }, afterVault);

  const stamp = lastChangeStamp(input.changes);
  return {
    actions: missingLocal.actions,
    nextState: {
      lastSince: stamp?.lastSince ?? input.state.lastSince,
      lastNoteId: stamp?.lastNoteId ?? input.state.lastNoteId,
      notes: missingLocal.notes,
    },
  };
};
