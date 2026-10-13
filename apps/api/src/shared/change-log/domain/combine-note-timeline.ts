import type { TimelineEntry } from '@yoink/api-contracts';

export const NOTE_SAVE_COMBINE_WINDOW_MS = 10 * 60 * 1000;

const isCombinableNoteKind = (kind: string): boolean =>
  kind === 'NoteCreated' || kind === 'NoteUpdated';

type CombineState = {
  readonly lastSeen: ReadonlyMap<string, string>;
  readonly kept: TimelineEntry[];
};

const withLastSeen = (
  previous: ReadonlyMap<string, string>,
  key: string,
  occurredAt: string
): ReadonlyMap<string, string> => new Map([...previous, [key, occurredAt]]);

const keepEntry = (state: CombineState, entry: TimelineEntry): CombineState => ({
  ...state,
  kept: state.kept.concat(entry),
});

/**
 * Newest-first: keep the latest save and drop older same-person, same-note
 * create/update entries that sit within 10 minutes of the previous one.
 */
export const combineNoteTimelineEntries = (
  entries: readonly TimelineEntry[]
): TimelineEntry[] =>
  entries.reduce<CombineState>((state, entry) => {
    if (!isCombinableNoteKind(entry.kind)) {
      return keepEntry(state, entry);
    }
    const key = `${entry.subject.id}:${entry.actor.userId ?? ''}`;
    const previous = state.lastSeen.get(key);
    const next = {
      lastSeen: withLastSeen(state.lastSeen, key, entry.occurredAt),
      kept: state.kept,
    };
    if (previous === undefined) {
      return keepEntry(next, entry);
    }
    const gapMs = Date.parse(previous) - Date.parse(entry.occurredAt);
    return gapMs > NOTE_SAVE_COMBINE_WINDOW_MS ? keepEntry(next, entry) : next;
  }, { lastSeen: new Map(), kept: [] }).kept;
