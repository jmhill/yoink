import { describe, it, expect } from 'vitest';
import { noteToMarkdown } from './note-markdown.js';
import { emptyMirrorState, planMirrorPass, type UpsertedChange } from './plan-mirror-pass.js';
import { vaultNotePath } from './vault-path.js';

const upsert = (overrides: Partial<UpsertedChange> = {}): UpsertedChange => ({
  kind: 'upserted',
  id: 'a1b2c3d4-e5f6-4aaa-8aaa-aaaaaaaaaaaa',
  projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  projectName: 'Garden',
  title: 'Meeting notes',
  body: 'First line',
  version: '1',
  createdAt: '2026-10-13T18:00:00.000Z',
  updatedAt: '2026-10-13T18:00:00.000Z',
  ...overrides,
});

const livePath = vaultNotePath({
  projectName: 'Garden',
  createdAt: '2026-10-13T18:00:00.000Z',
  noteId: 'a1b2c3d4-e5f6-4aaa-8aaa-aaaaaaaaaaaa',
});

describe('planMirrorPass', () => {
  it('writes a new Yoink note into the vault', () => {
    const plan = planMirrorPass({
      state: emptyMirrorState(),
      changes: [upsert()],
      vaultFiles: [],
    });
    expect(plan.actions).toEqual([
      expect.objectContaining({ type: 'write', relativePath: livePath }),
    ]);
    expect(plan.nextState.notes[upsert().id]?.title).toBe('Meeting notes');
  });

  it('updates a file that still matches the last synced copy', () => {
    const first = planMirrorPass({
      state: emptyMirrorState(),
      changes: [upsert()],
      vaultFiles: [],
    });
    const tracked = first.nextState.notes[upsert().id];
    if (!tracked) {
      throw new Error('expected tracked note');
    }
    const plan = planMirrorPass({
      state: first.nextState,
      changes: [upsert({ version: '2', body: 'Edited in Yoink', updatedAt: '2026-10-13T18:10:00.000Z' })],
      vaultFiles: [
        {
          relativePath: livePath,
          markdown: noteToMarkdown({
            id: tracked.noteId,
            projectId: tracked.projectId,
            version: tracked.version,
            updatedAt: tracked.updatedAt,
            title: tracked.title,
            body: tracked.body,
          }),
        },
      ],
    });
    expect(plan.actions[0]?.type).toBe('write');
    if (plan.actions[0]?.type === 'write') {
      expect(plan.actions[0].note.body).toBe('Edited in Yoink');
    }
  });

  it('archives a Yoink delete', () => {
    const first = planMirrorPass({
      state: emptyMirrorState(),
      changes: [upsert()],
      vaultFiles: [],
    });
    const plan = planMirrorPass({
      state: first.nextState,
      changes: [
        {
          kind: 'deleted',
          id: upsert().id,
          projectId: upsert().projectId,
          projectName: 'Garden',
          createdAt: '2026-10-13T18:00:00.000Z',
          deletedAt: '2026-10-13T18:20:00.000Z',
        },
      ],
      vaultFiles: [
        {
          relativePath: livePath,
          markdown: noteToMarkdown({
            id: upsert().id,
            projectId: upsert().projectId,
            version: '1',
            updatedAt: '2026-10-13T18:00:00.000Z',
            title: 'Meeting notes',
            body: 'First line',
          }),
        },
      ],
    });
    expect(plan.actions[0]).toMatchObject({
      type: 'archive',
      from: livePath,
      to: `archive/${livePath}`,
    });
    expect(plan.nextState.notes[upsert().id]).toBeUndefined();
  });

  it('flags an Obsidian-side delete without deleting in Yoink', () => {
    const first = planMirrorPass({
      state: emptyMirrorState(),
      changes: [upsert()],
      vaultFiles: [],
    });
    const plan = planMirrorPass({
      state: first.nextState,
      changes: [],
      vaultFiles: [],
    });
    expect(plan.actions).toEqual([
      {
        type: 'flag-obsidian-delete',
        noteId: upsert().id,
        relativePath: livePath,
      },
    ]);
    expect(plan.nextState.notes[upsert().id]).toBeTruthy();
  });

  it('moves a conflicting Obsidian copy to archive/sync-conflicts', () => {
    const first = planMirrorPass({
      state: emptyMirrorState(),
      changes: [upsert()],
      vaultFiles: [],
    });
    const tracked = first.nextState.notes[upsert().id];
    if (!tracked) {
      throw new Error('expected tracked note');
    }
    const plan = planMirrorPass({
      state: first.nextState,
      changes: [upsert({ version: '2', body: 'Yoink copy', updatedAt: '2026-10-13T18:10:00.000Z' })],
      vaultFiles: [
        {
          relativePath: livePath,
          markdown: noteToMarkdown({
            id: tracked.noteId,
            projectId: tracked.projectId,
            version: '1',
            updatedAt: tracked.updatedAt,
            title: tracked.title,
            body: 'Justin edited locally',
          }),
        },
      ],
    });
    expect(plan.actions[0]?.type).toBe('conflict');
    if (plan.actions[0]?.type === 'conflict') {
      expect(plan.actions[0].to.startsWith('archive/sync-conflicts/')).toBe(true);
      expect(plan.actions[0].yoinkMarkdown).toContain('Yoink copy');
    }
  });

  it('pushes an Obsidian edit when the base version still matches', () => {
    const first = planMirrorPass({
      state: emptyMirrorState(),
      changes: [upsert()],
      vaultFiles: [],
    });
    const plan = planMirrorPass({
      state: first.nextState,
      changes: [],
      vaultFiles: [
        {
          relativePath: livePath,
          markdown: noteToMarkdown({
            id: upsert().id,
            projectId: upsert().projectId,
            version: '1',
            updatedAt: '2026-10-13T18:00:00.000Z',
            title: 'Meeting notes',
            body: 'Justin edited in Obsidian',
          }),
        },
      ],
    });
    expect(plan.actions).toEqual([
      {
        type: 'push-update',
        projectId: upsert().projectId,
        noteId: upsert().id,
        title: 'Meeting notes',
        body: 'Justin edited in Obsidian',
        baseVersion: '1',
      },
    ]);
  });

  it('creates a new Obsidian file that has no Yoink id yet', () => {
    const first = planMirrorPass({
      state: emptyMirrorState(),
      changes: [upsert()],
      vaultFiles: [],
    });
    const plan = planMirrorPass({
      state: first.nextState,
      changes: [],
      vaultFiles: [
        {
          relativePath: livePath,
          markdown: noteToMarkdown({
            id: upsert().id,
            projectId: upsert().projectId,
            version: '1',
            updatedAt: '2026-10-13T18:00:00.000Z',
            title: 'Meeting notes',
            body: 'First line',
          }),
        },
        {
          relativePath: 'Yoink notes/Garden/scratch.md',
          markdown: '# New idea\n\nFrom the vault',
        },
      ],
    });
    expect(plan.actions).toContainEqual({
      type: 'push-create',
      projectId: upsert().projectId,
      title: 'New idea',
      body: 'From the vault',
      relativePath: 'Yoink notes/Garden/scratch.md',
    });
  });
});
