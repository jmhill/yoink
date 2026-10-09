import { z } from 'zod';
import { CaptureSchema } from './capture.js';
import { NamedListSchema } from './list.js';
import { TaskSchema } from './task.js';

/** Working-set reads (piles, Today, Upcoming, Mine, Inbox, lists) stop here. */
export const PILE_SAFETY_CAP = 1000;

/** Default page size for open-ended history (Done, Trash). */
export const HISTORY_PAGE_DEFAULT = 50;

export const ListLimitQuerySchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(PILE_SAFETY_CAP)
  .optional();

export const ListCursorQuerySchema = z.string().uuid().optional();

export const ListPageQuerySchema = z.object({
  limit: ListLimitQuerySchema,
  cursor: ListCursorQuerySchema,
});

export type ListPageQuery = z.infer<typeof ListPageQuerySchema>;

export const ListPageMetaSchema = z.object({
  hasMore: z.boolean(),
  nextCursor: z.string().uuid().nullable(),
  total: z.number().int().nonnegative(),
});

export type ListPageMeta = z.infer<typeof ListPageMetaSchema>;

export const TaskListPageSchema = ListPageMetaSchema.extend({
  tasks: z.array(TaskSchema),
});

export type TaskListPage = z.infer<typeof TaskListPageSchema>;

export const CaptureListPageSchema = ListPageMetaSchema.extend({
  captures: z.array(CaptureSchema),
});

export type CaptureListPage = z.infer<typeof CaptureListPageSchema>;

export const NamedListListPageSchema = ListPageMetaSchema.extend({
  lists: z.array(NamedListSchema),
});

export type NamedListListPage = z.infer<typeof NamedListListPageSchema>;

export const resolveListLimit = (
  requested: number | undefined,
  kind: 'pile' | 'history'
): number => {
  const fallback = kind === 'history' ? HISTORY_PAGE_DEFAULT : PILE_SAFETY_CAP;
  const limit = requested ?? fallback;
  return Math.min(Math.max(1, limit), PILE_SAFETY_CAP);
};
