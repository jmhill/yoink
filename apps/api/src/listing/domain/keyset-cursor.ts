import { z } from 'zod';
import { err, ok, type Result } from 'neverthrow';
import { invalidCursorError, type InvalidCursorError } from './invalid-cursor.js';

export type KeysetValue = string | number;

export const CursorViewSchema = z.enum([
  'tasks.board',
  'tasks.completed',
  'tasks.pile',
  'tasks.project',
  'tasks.project.finished',
  'history.project',
  'history.task',
  'lists',
  'projects',
  'captures.feed',
  'captures.snoozed',
  'work.next-actions',
  'work.due',
  'work.lists',
  'review',
  'review.done',
  'notes.project',
]);

export type CursorView = z.infer<typeof CursorViewSchema>;

const taskBoardKeysSchema = z.tuple([z.string(), z.string(), z.string()]);
const completedTaskKeysSchema = z.tuple([z.string(), z.string()]);
const pileTaskKeysSchema = z.tuple([z.number().int(), z.string(), z.string()]);
const projectTaskKeysSchema = z.tuple([z.string(), z.string()]);
const finishedProjectTaskKeysSchema = z.tuple([z.string(), z.string()]);
const projectHistoryKeysSchema = z.tuple([z.string(), z.number().int()]);
const taskHistoryKeysSchema = z.tuple([z.string(), z.number().int()]);
const namedListKeysSchema = z.tuple([z.string(), z.string(), z.string()]);
const projectKeysSchema = z.tuple([z.string(), z.string(), z.string()]);
const captureFeedKeysSchema = z.tuple([z.string(), z.string()]);
const snoozedCaptureKeysSchema = z.tuple([z.string(), z.string()]);
const workNextActionsKeysSchema = z.tuple([z.string(), z.string(), z.string()]);
const workDueKeysSchema = z.tuple([z.string(), z.string(), z.string()]);
const workListsKeysSchema = z.tuple([z.string(), z.string(), z.string()]);
const reviewKeysSchema = z.tuple([
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
]);
const doneListKeysSchema = z.tuple([z.string(), z.string()]);
const projectNotesKeysSchema = z.tuple([z.string(), z.string()]);

const CursorEnvelopeSchema = z.object({
  v: z.literal(1),
  view: CursorViewSchema,
  k: z.unknown(),
});

export type KeysetCursor =
  | { view: 'tasks.board'; keys: z.infer<typeof taskBoardKeysSchema> }
  | { view: 'tasks.completed'; keys: z.infer<typeof completedTaskKeysSchema> }
  | { view: 'tasks.pile'; keys: z.infer<typeof pileTaskKeysSchema> }
  | { view: 'tasks.project'; keys: z.infer<typeof projectTaskKeysSchema> }
  | { view: 'tasks.project.finished'; keys: z.infer<typeof finishedProjectTaskKeysSchema> }
  | { view: 'history.project'; keys: z.infer<typeof projectHistoryKeysSchema> }
  | { view: 'history.task'; keys: z.infer<typeof taskHistoryKeysSchema> }
  | { view: 'lists'; keys: z.infer<typeof namedListKeysSchema> }
  | { view: 'projects'; keys: z.infer<typeof projectKeysSchema> }
  | { view: 'captures.feed'; keys: z.infer<typeof captureFeedKeysSchema> }
  | { view: 'captures.snoozed'; keys: z.infer<typeof snoozedCaptureKeysSchema> }
  | { view: 'work.next-actions'; keys: z.infer<typeof workNextActionsKeysSchema> }
  | { view: 'work.due'; keys: z.infer<typeof workDueKeysSchema> }
  | { view: 'work.lists'; keys: z.infer<typeof workListsKeysSchema> }
  | { view: 'review'; keys: z.infer<typeof reviewKeysSchema> }
  | { view: 'review.done'; keys: z.infer<typeof doneListKeysSchema> }
  | { view: 'notes.project'; keys: z.infer<typeof projectNotesKeysSchema> };

export type ListedCursor<T, V extends CursorView> = {
  readonly view: V;
  readonly of: (item: T) => Extract<KeysetCursor, { view: V }>;
};

export type AnyListedCursor<T> = {
  [View in CursorView]: ListedCursor<T, View>;
}[CursorView];

export type ListedCursorPayload = {
  v: 1;
  view: CursorView;
  k: readonly KeysetValue[];
};

export const listedCursorPayload = (cursor: KeysetCursor): ListedCursorPayload => ({
  v: 1,
  view: cursor.view,
  k: cursor.keys,
});

const parseKeys = (
  expectedView: CursorView,
  rawKeys: unknown
): Result<KeysetCursor, InvalidCursorError> => {
  switch (expectedView) {
    case 'tasks.board': {
      const keys = taskBoardKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'tasks.board', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'tasks.completed': {
      const keys = completedTaskKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'tasks.completed', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'tasks.pile': {
      const keys = pileTaskKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'tasks.pile', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'tasks.project': {
      const keys = projectTaskKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'tasks.project', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'tasks.project.finished': {
      const keys = finishedProjectTaskKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'tasks.project.finished', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'history.project': {
      const keys = projectHistoryKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'history.project', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'history.task': {
      const keys = taskHistoryKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'history.task', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'lists': {
      const keys = namedListKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'lists', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'projects': {
      const keys = projectKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'projects', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'captures.feed': {
      const keys = captureFeedKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'captures.feed', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'captures.snoozed': {
      const keys = snoozedCaptureKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'captures.snoozed', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'work.next-actions': {
      const keys = workNextActionsKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'work.next-actions', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'work.due': {
      const keys = workDueKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'work.due', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'work.lists': {
      const keys = workListsKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'work.lists', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'review': {
      const keys = reviewKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'review', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'review.done': {
      const keys = doneListKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'review.done', keys: keys.data })
        : err(invalidCursorError());
    }
    case 'notes.project': {
      const keys = projectNotesKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'notes.project', keys: keys.data })
        : err(invalidCursorError());
    }
  }
};

export const parseListedCursor = (
  decoded: unknown,
  expectedView: CursorView
): Result<KeysetCursor, InvalidCursorError> => {
  const envelope = CursorEnvelopeSchema.safeParse(decoded);
  if (!envelope.success || envelope.data.view !== expectedView) {
    return err(invalidCursorError());
  }
  return parseKeys(expectedView, envelope.data.k);
};
