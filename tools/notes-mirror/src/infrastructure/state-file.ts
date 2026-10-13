import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyMirrorState, type MirrorState } from '../domain/plan-mirror-pass.js';
import type { StateStore } from '../application/run-mirror.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseState = (value: unknown): MirrorState => {
  if (!isRecord(value)) {
    return emptyMirrorState();
  }
  const lastSince =
    typeof value.lastSince === 'string' ? value.lastSince : emptyMirrorState().lastSince;
  const lastNoteId = typeof value.lastNoteId === 'string' ? value.lastNoteId : null;
  const notes = isRecord(value.notes) ? value.notes : {};
  return {
    lastSince,
    lastNoteId,
    notes: Object.fromEntries(
      Object.entries(notes).flatMap(([id, note]) => {
        if (!isRecord(note) || typeof note.noteId !== 'string') {
          return [];
        }
        if (
          typeof note.relativePath !== 'string' ||
          typeof note.version !== 'string' ||
          typeof note.title !== 'string' ||
          typeof note.body !== 'string' ||
          typeof note.projectId !== 'string' ||
          typeof note.projectName !== 'string' ||
          typeof note.createdAt !== 'string' ||
          typeof note.updatedAt !== 'string'
        ) {
          return [];
        }
        return [
          [
            id,
            {
              noteId: note.noteId,
              relativePath: note.relativePath,
              version: note.version,
              title: note.title,
              body: note.body,
              projectId: note.projectId,
              projectName: note.projectName,
              createdAt: note.createdAt,
              updatedAt: note.updatedAt,
            },
          ],
        ];
      })
    ),
  };
};

export const createStateStore = (statePath: string): StateStore => ({
  load: async () => {
    const raw = await readFile(statePath, 'utf8').catch(() => '');
    if (raw.length === 0) {
      return emptyMirrorState();
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return parseState(parsed);
    } catch {
      return emptyMirrorState();
    }
  },
  save: async (state) => {
    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  },
});
