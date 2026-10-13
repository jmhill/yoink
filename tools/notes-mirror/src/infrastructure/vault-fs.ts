import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { YOINK_NOTES_FOLDER } from '../domain/vault-path.js';
import type { VaultFile } from '../domain/plan-mirror-pass.js';
import type { VaultStore } from '../application/run-mirror.js';

const collectMarkdown = async (root: string, relative: string): Promise<readonly VaultFile[]> => {
  const abs = path.join(root, relative);
  const entries = await readdir(abs, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        return collectMarkdown(root, child);
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        return [];
      }
      const markdown = await readFile(path.join(root, child), 'utf8');
      return [{ relativePath: child, markdown }];
    })
  );
  return nested.flat();
};

export const createVaultStore = (vaultRoot: string): VaultStore => ({
  listNoteFiles: () => collectMarkdown(vaultRoot, YOINK_NOTES_FOLDER),
  writeFile: async (relativePath, contents) => {
    const dest = path.join(vaultRoot, relativePath);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, contents, 'utf8');
  },
  moveFile: async (from, to) => {
    const source = path.join(vaultRoot, from);
    const dest = path.join(vaultRoot, to);
    await mkdir(path.dirname(dest), { recursive: true });
    await rename(source, dest).catch(async () => {
      const contents = await readFile(source, 'utf8');
      await writeFile(dest, contents, 'utf8');
    });
  },
});
