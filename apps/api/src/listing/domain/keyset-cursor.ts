import { z } from 'zod';
import { err, ok, type Result } from 'neverthrow';
import { invalidCursorError, type InvalidCursorError } from './invalid-cursor.js';

export type KeysetValue = string | number;

export const CursorViewSchema = z.enum([
  'tasks.board',
  'tasks.completed',
  'tasks.pile',
  'lists',
  'captures.feed',
  'captures.snoozed',
]);

export type CursorView = z.infer<typeof CursorViewSchema>;

const taskBoardKeysSchema = z.tuple([z.string(), z.string(), z.string()]);
const completedTaskKeysSchema = z.tuple([z.string(), z.string()]);
const pileTaskKeysSchema = z.tuple([z.number().int(), z.string(), z.string()]);
const namedListKeysSchema = z.tuple([z.string(), z.string(), z.string()]);
const captureFeedKeysSchema = z.tuple([z.string(), z.string()]);
const snoozedCaptureKeysSchema = z.tuple([z.string(), z.string()]);

const CursorEnvelopeSchema = z.object({
  v: z.literal(1),
  view: CursorViewSchema,
  k: z.unknown(),
});

export type KeysetCursor =
  | { view: 'tasks.board'; keys: z.infer<typeof taskBoardKeysSchema> }
  | { view: 'tasks.completed'; keys: z.infer<typeof completedTaskKeysSchema> }
  | { view: 'tasks.pile'; keys: z.infer<typeof pileTaskKeysSchema> }
  | { view: 'lists'; keys: z.infer<typeof namedListKeysSchema> }
  | { view: 'captures.feed'; keys: z.infer<typeof captureFeedKeysSchema> }
  | { view: 'captures.snoozed'; keys: z.infer<typeof snoozedCaptureKeysSchema> };

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
    case 'lists': {
      const keys = namedListKeysSchema.safeParse(rawKeys);
      return keys.success
        ? ok({ view: 'lists', keys: keys.data })
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
