import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ok, err } from 'neverthrow';
import { runMirror, type ImportedNote, type NotesMirrorApi } from './run-mirror.js';
import { createVaultStore } from '../infrastructure/vault-fs.js';
import { createStateStore } from '../infrastructure/state-file.js';
import { emptyMirrorState, type FeedChange, type UpsertedChange } from '../domain/plan-mirror-pass.js';
import { noteToMarkdown } from '../domain/note-markdown.js';
import { vaultNotePath } from '../domain/vault-path.js';

const noteId = 'a1b2c3d4-e5f6-4aaa-8aaa-aaaaaaaaaaaa';
const createdId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const upsert = (
  body: string,
  version: string,
  overrides: Partial<Omit<UpsertedChange, 'kind'>> = {}
): UpsertedChange => ({
  kind: 'upserted',
  id: noteId,
  projectId,
  projectName: 'Garden',
  title: 'Meeting notes',
  body,
  version,
  createdAt: '2026-10-13T18:00:00.000Z',
  updatedAt: '2026-10-13T18:00:00.000Z',
  ...overrides,
});

const importedFrom = (input: {
  id: string;
  title: string;
  body: string;
  version: string;
}): ImportedNote => ({
  id: input.id,
  projectId,
  title: input.title,
  body: input.body,
  version: input.version,
  createdAt: '2026-10-13T18:00:00.000Z',
  updatedAt: '2026-10-13T18:00:00.000Z',
});

const listMarkdown = async (vaultRoot: string): Promise<readonly string[]> => {
  const files = await createVaultStore(vaultRoot).listNoteFiles();
  return files.map((file) => file.relativePath).sort();
};

describe('runMirror integration', () => {
  it('writes a temp vault from a test API and stays idempotent', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'yoink-notes-mirror-'));
    const vaultRoot = path.join(root, 'vault');
    const statePath = path.join(root, 'state.json');
    await mkdir(vaultRoot, { recursive: true });

    let feed: FeedChange[] = [upsert('From Yoink', '1')];
    const api: NotesMirrorApi = {
      listChanged: async () =>
        ok({
          changes: feed,
          hasMore: false,
          nextCursor: null,
        }),
      importNote: async () => err({ type: 'failed', message: 'import should not run on the first pass' }),
    };

    const first = await runMirror({
      api,
      vault: createVaultStore(vaultRoot),
      state: createStateStore(statePath),
    });
    expect(first.isOk()).toBe(true);

    const live = vaultNotePath({
      projectName: 'Garden',
      projectId,
      createdAt: '2026-10-13T18:00:00.000Z',
      noteId,
    });
    const written = await readFile(path.join(vaultRoot, live), 'utf8');
    expect(written).toContain('From Yoink');
    expect(written).toContain(noteId);

    const second = await runMirror({
      api,
      vault: createVaultStore(vaultRoot),
      state: createStateStore(statePath),
    });
    expect(second.isOk()).toBe(true);
    if (second.isOk()) {
      const writes = second.value.actions.filter((action) => action.type === 'write');
      expect(writes).toHaveLength(1);
    }

    feed = [
      {
        kind: 'deleted',
        id: noteId,
        projectId,
        projectName: 'Garden',
        createdAt: '2026-10-13T18:00:00.000Z',
        deletedAt: '2026-10-13T18:30:00.000Z',
      },
    ];
    const afterDelete = await runMirror({
      api,
      vault: createVaultStore(vaultRoot),
      state: createStateStore(statePath),
    });
    expect(afterDelete.isOk()).toBe(true);
    const archived = await readdir(path.join(vaultRoot, 'archive', 'Yoink notes', 'Garden'));
    expect(archived.some((name) => name.includes('a1b2c3'))).toBe(true);
    expect(emptyMirrorState().lastSince).toBe('1970-01-01T00:00:00.000Z');
  });

  it('moves a vault-only create to the canonical path and creates it only once', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'yoink-notes-create-twice-'));
    const vaultRoot = path.join(root, 'vault');
    const statePath = path.join(root, 'state.json');
    const gardenDir = path.join(vaultRoot, 'Yoink notes', 'Garden');
    await mkdir(gardenDir, { recursive: true });
    await writeFile(path.join(gardenDir, 'scratch.md'), '# New idea\n\nFrom the vault\n');

    const state = createStateStore(statePath);
    await state.save({
      lastSince: '2026-10-13T18:00:00.000Z',
      notes: {
        [noteId]: {
          noteId,
          relativePath: vaultNotePath({
            projectName: 'Garden',
            projectId,
            createdAt: '2026-10-13T18:00:00.000Z',
            noteId,
          }),
          version: '1',
          title: 'Meeting notes',
          body: 'From Yoink',
          projectId,
          projectName: 'Garden',
          createdAt: '2026-10-13T18:00:00.000Z',
          updatedAt: '2026-10-13T18:00:00.000Z',
        },
      },
    });

    let creates = 0;
    const api: NotesMirrorApi = {
      listChanged: async () =>
        ok({
          changes: [],
          hasMore: false,
          nextCursor: null,
        }),
      importNote: async (payload) => {
        creates += 1;
        return ok(
          importedFrom({
            id: createdId,
            title: payload.title,
            body: payload.body,
            version: '1',
          })
        );
      },
    };

    const first = await runMirror({
      api,
      vault: createVaultStore(vaultRoot),
      state,
    });
    expect(first.isOk()).toBe(true);
    expect(creates).toBe(1);

    const canonical = vaultNotePath({
      projectName: 'Garden',
      projectId,
      createdAt: '2026-10-13T18:00:00.000Z',
      noteId: createdId,
    });
    expect(await listMarkdown(vaultRoot)).toEqual([canonical]);
    const createdMarkdown = await readFile(path.join(vaultRoot, canonical), 'utf8');
    expect(createdMarkdown).toContain(createdId);
    expect(createdMarkdown).toContain('New idea');

    const second = await runMirror({
      api,
      vault: createVaultStore(vaultRoot),
      state,
    });
    expect(second.isOk()).toBe(true);
    expect(creates).toBe(1);
    expect(await listMarkdown(vaultRoot)).toEqual([canonical]);
  });

  it('moves a note into the renamed project folder so one file remains', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'yoink-notes-rename-'));
    const vaultRoot = path.join(root, 'vault');
    const statePath = path.join(root, 'state.json');
    await mkdir(vaultRoot, { recursive: true });

    let feed: FeedChange[] = [upsert('From Yoink', '1')];
    const api: NotesMirrorApi = {
      listChanged: async () =>
        ok({
          changes: feed,
          hasMore: false,
          nextCursor: null,
        }),
      importNote: async () => err({ type: 'failed', message: 'import should not run on rename' }),
    };

    const first = await runMirror({
      api,
      vault: createVaultStore(vaultRoot),
      state: createStateStore(statePath),
    });
    expect(first.isOk()).toBe(true);

    const gardenPath = vaultNotePath({
      projectName: 'Garden',
      projectId,
      createdAt: '2026-10-13T18:00:00.000Z',
      noteId,
    });
    const harborPath = vaultNotePath({
      projectName: 'Harbor shed',
      projectId,
      createdAt: '2026-10-13T18:00:00.000Z',
      noteId,
    });
    expect(await listMarkdown(vaultRoot)).toEqual([gardenPath]);

    feed = [upsert('From Yoink', '1', { projectName: 'Harbor shed' })];
    const renamed = await runMirror({
      api,
      vault: createVaultStore(vaultRoot),
      state: createStateStore(statePath),
    });
    expect(renamed.isOk()).toBe(true);
    expect(await listMarkdown(vaultRoot)).toEqual([harborPath]);
    await expect(readFile(path.join(vaultRoot, gardenPath), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const moved = await readFile(path.join(vaultRoot, harborPath), 'utf8');
    expect(moved).toContain(noteId);
    expect(moved).toContain('From Yoink');
  });

  it('flags a 409 on one note and continues the rest of the run', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'yoink-notes-409-'));
    const vaultRoot = path.join(root, 'vault');
    const statePath = path.join(root, 'state.json');
    const gardenDir = path.join(vaultRoot, 'Yoink notes', 'Garden');
    await mkdir(gardenDir, { recursive: true });

    let feed: FeedChange[] = [upsert('From Yoink', '1')];
    const importedIds: string[] = [];
    const api: NotesMirrorApi = {
      listChanged: async () =>
        ok({
          changes: feed,
          hasMore: false,
          nextCursor: null,
        }),
      importNote: async (payload) => {
        importedIds.push(payload.title);
        if (payload.title === 'Conflicted idea') {
          return err({ type: 'NOTE_SYNC_CONFLICT', message: 'Yoink changed first' });
        }
        return ok(
          importedFrom({
            id: createdId,
            title: payload.title,
            body: payload.body,
            version: '1',
          })
        );
      },
    };

    const seed = await runMirror({
      api,
      vault: createVaultStore(vaultRoot),
      state: createStateStore(statePath),
    });
    expect(seed.isOk()).toBe(true);

    feed = [];
    await writeFile(path.join(gardenDir, 'conflict.md'), '# Conflicted idea\n\nStale vault copy\n');
    await writeFile(path.join(gardenDir, 'ok.md'), '# Later idea\n\nShould still import\n');

    const result = await runMirror({
      api,
      vault: createVaultStore(vaultRoot),
      state: createStateStore(statePath),
    });
    expect(result.isOk()).toBe(true);
    expect(importedIds).toHaveLength(2);
    expect(importedIds).toContain('Conflicted idea');
    expect(importedIds).toContain('Later idea');
    if (result.isOk()) {
      expect(result.value.warnings.some((warning) => warning.includes('Conflict'))).toBe(true);
    }
    const files = await listMarkdown(vaultRoot);
    expect(files.some((file) => file.endsWith('conflict.md'))).toBe(true);
    expect(files.some((file) => file.includes('cccccc'))).toBe(true);
    expect(files.some((file) => file.endsWith('ok.md'))).toBe(false);
  });

  it('never talks to a real vault path in tests', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'yoink-notes-mirror-'));
    expect(root.includes('/home/box/obsidian-vault')).toBe(false);
    await writeFile(
      path.join(root, 'probe.md'),
      noteToMarkdown({
        id: noteId,
        projectId,
        version: '1',
        updatedAt: '2026-10-13T18:00:00.000Z',
        title: 'Meeting notes',
        body: '',
      }),
      'utf8'
    );
  });
});
