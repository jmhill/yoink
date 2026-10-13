import { describe, it, expect } from 'vitest';
import { safeProjectFolderName, vaultNotePath } from './vault-path.js';

describe('vault path', () => {
  it('uses the project id when the name is not a usable folder', () => {
    const projectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    expect(safeProjectFolderName('...', projectId)).toBe(projectId);
    expect(
      vaultNotePath({
        projectName: '...',
        projectId,
        createdAt: '2026-10-13T18:00:00.000Z',
        noteId: 'a1b2c3d4-e5f6-4aaa-8aaa-aaaaaaaaaaaa',
      })
    ).toBe(`Yoink notes/${projectId}/2026-10-13 a1b2c3.md`);
  });
});
