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
  today: z.string().date().optional(),
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

export const WorkNowQuerySchema = ListPageQuerySchema.extend({
  owner: NowOwnerSchema.optional().default('all'),
}).merge(ViewerTodayQuerySchema);

export type WorkNowQuery = z.infer<typeof WorkNowQuerySchema>;
