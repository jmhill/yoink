import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { err, ok, type Result } from 'neverthrow';
import { YOINK_NOTES_FOLDER } from '../domain/vault-path.js';
import type { VaultFile } from '../domain/plan-mirror-pass.js';
import type { VaultMoveError, VaultStore } from '../application/run-mirror.js';

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

const isEnoent = (cause: unknown): boolean =>
  typeof cause === 'object' &&
  cause !== null &&
  'code' in cause &&
  cause.code === 'ENOENT';

export const moveVaultFile = async (
  vaultRoot: string,
  from: string,
  to: string,
  renameImpl: typeof rename = rename
): Promise<Result<void, VaultMoveError>> => {
  if (from === to) {
    return ok(undefined);
  }
  const source = path.join(vaultRoot, from);
  const dest = path.join(vaultRoot, to);
  await mkdir(path.dirname(dest), { recursive: true });

  const renamed = await renameImpl(source, dest)
    .then(() => true as const)
    .catch((cause: unknown) => cause);
  if (renamed === true) {
    return ok(undefined);
  }
  if (isEnoent(renamed)) {
    return err({ type: 'SOURCE_MISSING', from });
  }

  const copied = await readFile(source, 'utf8')
    .then((contents) => contents)
    .catch((cause: unknown) => cause);
  if (typeof copied !== 'string') {
    return isEnoent(copied)
      ? err({ type: 'SOURCE_MISSING', from })
      : err({
          type: 'MOVE_FAILED',
          from,
          to,
          message: copied instanceof Error ? copied.message : 'Failed to read source for move',
        });
  }
  const written = await writeFile(dest, copied, 'utf8')
    .then(() => true as const)
    .catch((cause: unknown) => cause);
  if (written !== true) {
    return err({
      type: 'MOVE_FAILED',
      from,
      to,
      message: written instanceof Error ? written.message : 'Failed to copy source for move',
    });
  }
  const removed = await unlink(source)
    .then(() => true as const)
    .catch((cause: unknown) => cause);
  if (removed !== true) {
    return err({
      type: 'MOVE_FAILED',
      from,
      to,
      message: removed instanceof Error ? removed.message : 'Copied the note but failed to remove the original',
    });
  }
  return ok(undefined);
};

export const createVaultStore = (vaultRoot: string): VaultStore => ({
  listNoteFiles: () => collectMarkdown(vaultRoot, YOINK_NOTES_FOLDER),
  writeFile: async (relativePath, contents) => {
    const dest = path.join(vaultRoot, relativePath);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, contents, 'utf8');
  },
  moveFile: (from, to) => moveVaultFile(vaultRoot, from, to),
});
