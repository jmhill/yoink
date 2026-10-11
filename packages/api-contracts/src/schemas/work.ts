import { z } from 'zod';
import { ListPageMetaSchema, ListPageQuerySchema } from './list-page.js';
import { TaskSchema } from './task.js';

export const NowOwnerSchema = z.enum(['all', 'me']);
export type NowOwner = z.infer<typeof NowOwnerSchema>;

export const TimeZoneSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid IANA time zone' }
  );

export type TimeZone = z.infer<typeof TimeZoneSchema>;

export const ViewerTodayQuerySchema = z.object({
  timeZone: TimeZoneSchema.optional(),
});

export type ViewerTodayQuery = z.infer<typeof ViewerTodayQuerySchema>;

export const NowNextActionItemSchema = z.object({
  task: TaskSchema,
  project: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
  }),
});

export type NowNextActionItem = z.infer<typeof NowNextActionItemSchema>;

export const WorkNextActionsPageSchema = ListPageMetaSchema.extend({
  items: z.array(NowNextActionItemSchema),
});

export type WorkNextActionsPage = z.infer<typeof WorkNextActionsPageSchema>;

export const WorkListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  openTaskCount: z.number().int().nonnegative(),
});

export type WorkListItem = z.infer<typeof WorkListItemSchema>;

export const WorkListsPageSchema = ListPageMetaSchema.extend({
  lists: z.array(WorkListItemSchema),
  unlisted: z.object({
    openTaskCount: z.number().int().nonnegative(),
  }),
});

export type WorkListsPage = z.infer<typeof WorkListsPageSchema>;

export const WorkOwnerQuerySchema = ListPageQuerySchema.extend({
  owner: NowOwnerSchema.optional().default('all'),
});

export type WorkOwnerQuery = z.infer<typeof WorkOwnerQuerySchema>;

/** Next actions do not depend on viewer today. */
export const WorkNextActionsQuerySchema = WorkOwnerQuerySchema;
export type WorkNextActionsQuery = z.infer<typeof WorkNextActionsQuerySchema>;

export const WorkDueQuerySchema = WorkOwnerQuerySchema.merge(ViewerTodayQuerySchema);
export type WorkDueQuery = z.infer<typeof WorkDueQuerySchema>;
