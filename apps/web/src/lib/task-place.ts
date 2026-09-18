import type { AllPile } from './all-tasks-piles';

export const TASK_PLACE_SUBCOPY_TEST_ID = 'task-place-subcopy';

export type TaskPlace =
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'mine' }
  | { kind: 'done' }
  | { kind: 'unlisted' }
  | { kind: 'named'; name: string };

/**
 * Current pile/smart-view as the you-are-here place. Named-list and
 * Unlisted screens are pile-only; omitted pile is a smart view.
 */
export function taskPlaceFromBoard(options: {
  pile: Exclude<AllPile, { kind: 'overview' }> | null;
  filter: string;
  namedListName?: string;
}): TaskPlace {
  if (options.pile?.kind === 'named') {
    return { kind: 'named', name: options.namedListName ?? 'List' };
  }
  if (options.pile?.kind === 'unlisted') {
    return { kind: 'unlisted' };
  }
  if (options.filter === 'upcoming') {
    return { kind: 'upcoming' };
  }
  if (options.filter === 'mine') {
    return { kind: 'mine' };
  }
  if (options.filter === 'completed') {
    return { kind: 'done' };
  }
  return { kind: 'today' };
}

export function taskPlaceHeading(place: TaskPlace): string {
  if (place.kind === 'named') {
    return place.name;
  }
  if (place.kind === 'unlisted') {
    return 'Unlisted';
  }
  if (place.kind === 'upcoming') {
    return 'Upcoming';
  }
  if (place.kind === 'mine') {
    return 'Mine';
  }
  if (place.kind === 'done') {
    return 'Done';
  }
  return 'Today';
}

/**
 * Short cue under the place name — open/assigned/completed count.
 * Inbox keeps its own “to process · references & triage” language.
 */
export function taskPlaceSubcopy(place: TaskPlace, count: number): string {
  if (place.kind === 'mine') {
    return `${count} assigned`;
  }
  if (place.kind === 'done') {
    return `${count} completed`;
  }
  return `${count} open`;
}
