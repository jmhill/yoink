import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import { ListLimitQuerySchema, ListPageQuerySchema } from '../schemas/list-page.js';
import { TaskSchema } from '../schemas/task.js';
import {
  NowOwnerSchema,
  TimeZoneSchema,
  WorkListsPageSchema,
} from '../schemas/work.js';

/**
 * Query values are JSON-parsed. Otherwise they stay strings, and
 * `z.coerce.boolean()` turns `"false"` into `true`.
 */
const workScreenQueryStyles = {
  limit: 'json',
  owner: 'json',
  timeZone: 'json',
} as const;

const workListsQueryStyles = {
  limit: 'json',
  cursor: 'json',
} as const;

const workScreenQuery = z.object({
  limit: ListLimitQuerySchema,
  owner: NowOwnerSchema.optional().default('all'),
  timeZone: TimeZoneSchema.optional(),
});

export const WorkScreenRowSourceSchema = z.enum(['due', 'next-action', 'both']);
export type WorkScreenRowSource = z.infer<typeof WorkScreenRowSourceSchema>;

export const WorkScreenRowSchema = z.object({
  task: TaskSchema,
  projectLabel: z.string().min(1).optional(),
  projectId: z.string().uuid().optional(),
  ownerLabel: z.string().min(1).optional(),
  source: WorkScreenRowSourceSchema,
});

export type WorkScreenRow = z.infer<typeof WorkScreenRowSchema>;

export const WorkScreenSectionNameSchema = z.enum(['due', 'next-actions']);
export type WorkScreenSectionName = z.infer<typeof WorkScreenSectionNameSchema>;

export const WorkScreenSectionSchema = z.object({
  name: WorkScreenSectionNameSchema,
  rows: z.array(WorkScreenRowSchema),
});

export type WorkScreenSection = z.infer<typeof WorkScreenSectionSchema>;

/**
 * Header counts are the Now and due query totals. The due total still omits
 * next actions the due query left out. Section length is not that total.
 */
export const WorkScreenSchema = z.object({
  nextActionCount: z.number().int().nonnegative(),
  dueCount: z.number().int().nonnegative(),
  sections: z.array(WorkScreenSectionSchema),
});

export type WorkScreen = z.infer<typeof WorkScreenSchema>;

/**
 * Work screen. Paths are the resource after `/web-api`.
 * The screen arranges Task Management's Now and due pages into sections.
 * Lists are that query's page. The same list procedure stays on `/api` and
 * `/api/v1`. Task writes stay on `/api` until this screen's mutations move.
 */
export const webWorkContract = oc.router({
  screen: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/work',
        summary:
          'Work screen: Due and Next actions from the Now and due pages, with query totals and owner labels',
        queryStyles: workScreenQueryStyles,
      })
    )
    .input(workScreenQuery)
    .output(WorkScreenSchema),
  listLists: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/work/lists',
        summary:
          'Named lists in GET /api/lists order with open-task counts, plus the Unlisted open count',
        queryStyles: workListsQueryStyles,
      })
    )
    .input(ListPageQuerySchema)
    .output(WorkListsPageSchema),
});
