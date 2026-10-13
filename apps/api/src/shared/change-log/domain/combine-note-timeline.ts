import type { TimelineEntry } from '@yoink/api-contracts';

export const NOTE_SAVE_COMBINE_WINDOW_MS = 10 * 60 * 1000;

const isCombinableNoteKind = (kind: string): boolean =>
  kind === 'NoteCreated' || kind === 'NoteUpdated';

/**
 * Newest-first: keep the latest save and drop older same-person, same-note
 * create/update entries that sit within 10 minutes of the previous one.
 */
export const combineNoteTimelineEntries = (
  entries: readonly TimelineEntry[]
): TimelineEntry[] => {
  const lastSeen = new Map<string, string>();
  return entries.filter((entry) => {
    if (!isCombinableNoteKind(entry.kind)) {
      return true;
    }
    const key = `${entry.subject.id}:${entry.actor.userId ?? ''}`;
    const previous = lastSeen.get(key);
    lastSeen.set(key, entry.occurredAt);
    if (previous === undefined) {
      return true;
    }
    return Date.parse(previous) - Date.parse(entry.occurredAt) > NOTE_SAVE_COMBINE_WINDOW_MS;
  });
};
