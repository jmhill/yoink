import { describe, it, expect } from 'vitest';
import {
  noteShortId,
  safeProjectFolderName,
  vaultArchivePath,
  vaultNotePath,
  vaultSyncConflictPath,
} from './vault-path.js';

const noteId = 'a1b2c3d4-e5f6-4aaa-8aaa-aaaaaaaaaaaa';

describe('vault path rule', () => {
  it('uses created date and a 6-character short id, never the title', () => {
    expect(noteShortId(noteId)).toBe('a1b2c3');
    expect(
      vaultNotePath({
        projectName: 'Garden',
        createdAt: '2026-10-13T18:04:00.000Z',
        noteId,
      })
    ).toBe('Yoink notes/Garden/2026-10-13 a1b2c3.md');
  });

  it('makes project folder names safe and deterministic', () => {
    expect(safeProjectFolderName('Harbor/shed: "dock"?')).toBe('Harbor-shed-dock');
    expect(safeProjectFolderName('A\\B:*?"<>|')).toBe('A-B');
    expect(safeProjectFolderName('...')).toBe('project');
    expect(safeProjectFolderName('...', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toBe(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
    expect(safeProjectFolderName('Café')).toBe('Café');
    expect(
      vaultNotePath({
        projectName: '...',
        projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        createdAt: '2026-10-13T18:04:00.000Z',
        noteId,
      })
    ).toBe('Yoink notes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/2026-10-13 a1b2c3.md');
  });

  it('keeps the same path when the title changes', () => {
    const first = vaultNotePath({
      projectName: 'Garden',
      createdAt: '2026-10-13T18:00:00.000Z',
      noteId,
    });
    const renamed = vaultNotePath({
      projectName: 'Garden',
      createdAt: '2026-10-13T18:00:00.000Z',
      noteId,
    });
    expect(first).toBe(renamed);
  });

  it('gives two notes with the same title different files', () => {
    const left = vaultNotePath({
      projectName: 'Garden',
      createdAt: '2026-10-13T18:00:00.000Z',
      noteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    const right = vaultNotePath({
      projectName: 'Garden',
      createdAt: '2026-10-13T18:00:00.000Z',
      noteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(left).not.toBe(right);
    expect(left).toBe('Yoink notes/Garden/2026-10-13 aaaaaa.md');
    expect(right).toBe('Yoink notes/Garden/2026-10-13 bbbbbb.md');
  });

  it('archives Yoink deletes and sync conflicts outside the notes folder', () => {
    const live = vaultNotePath({
      projectName: 'Garden',
      createdAt: '2026-10-13T18:00:00.000Z',
      noteId,
    });
    expect(vaultArchivePath(live)).toBe(`archive/${live}`);
    expect(
      vaultSyncConflictPath({
        createdAt: '2026-10-13T18:00:00.000Z',
        noteId,
        conflictedAt: '2026-10-13T18:15:00.000Z',
      })
    ).toBe('archive/sync-conflicts/2026-10-13 a1b2c3 2026-10-13T181500-000Z.md');
  });
});
