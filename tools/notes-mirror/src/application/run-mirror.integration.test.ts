import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ok, err } from 'neverthrow';
import { runMirror, type NotesMirrorApi } from './run-mirror.js';
import { createVaultStore } from '../infrastructure/vault-fs.js';
import { createStateStore } from '../infrastructure/state-file.js';
import { emptyMirrorState, type FeedChange } from '../domain/plan-mirror-pass.js';
import { noteToMarkdown } from '../domain/note-markdown.js';
import { vaultNotePath } from '../domain/vault-path.js';

const noteId = 'a1b2c3d4-e5f6-4aaa-8aaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const upsert = (body: string, version: string): FeedChange => ({
  kind: 'upserted',
  id: noteId,
  projectId,
  projectName: 'Garden',
  title: 'Meeting notes',
  body,
  version,
  createdAt: '2026-10-13T18:00:00.000Z',
  updatedAt: '2026-10-13T18:00:00.000Z',
});

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
      importNote: async () => err('import should not run on the first pass'),
    };

    const first = await runMirror({
      api,
      vault: createVaultStore(vaultRoot),
      state: createStateStore(statePath),
    });
    expect(first.isOk()).toBe(true);

    const live = vaultNotePath({
      projectName: 'Garden',
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
