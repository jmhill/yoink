import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { moveVaultFile } from './vault-fs.js';

describe('moveVaultFile', () => {
  it('returns SOURCE_MISSING when the source file is gone', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'yoink-vault-move-'));
    const result = await moveVaultFile(root, 'Yoink notes/Garden/scratch.md', 'Yoink notes/Garden/dest.md');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        type: 'SOURCE_MISSING',
        from: 'Yoink notes/Garden/scratch.md',
      });
    }
  });

  it('unlinks the source after a copy fallback so one file remains', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'yoink-vault-copy-'));
    await mkdir(path.join(root, 'Yoink notes', 'Garden'), { recursive: true });
    const from = 'Yoink notes/Garden/scratch.md';
    const to = 'Yoink notes/Garden/2026-10-13 a1b2c3.md';
    await writeFile(path.join(root, from), '# Scratch\n');

    const failRename = async () => {
      throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
    };
    const result = await moveVaultFile(root, from, to, failRename);
    expect(result.isOk()).toBe(true);
    await expect(readFile(path.join(root, to), 'utf8')).resolves.toBe('# Scratch\n');
    await expect(readFile(path.join(root, from), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
