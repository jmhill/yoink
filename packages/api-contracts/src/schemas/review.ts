import { z } from 'zod';
import { ListPageMetaSchema, ListPageQuerySchema } from './list-page.js';
import { ProjectSchema } from './project.js';
import { ViewerTodayQuerySchema } from './work.js';

export const ReviewReasonSchema = z.enum(['noNextAction', 'quiet', 'waiting']);
export type ReviewReason = z.infer<typeof ReviewReasonSchema>;

export const ReviewNextActionSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  dueDate: z.string().date().nullable(),
});
export type ReviewNextAction = z.infer<typeof ReviewNextActionSchema>;

export const ReviewProjectSchema = z.object({
  project: ProjectSchema,
  reasons: z.array(ReviewReasonSchema).min(1),
  lastChangeAt: z.string().datetime(),
  daysSinceChange: z.number().int().nonnegative(),
  daysWaiting: z.number().int().nonnegative().nullable(),
  nextAction: ReviewNextActionSchema.nullable(),
});
export type ReviewProject = z.infer<typeof ReviewProjectSchema>;

export const ReviewCountsSchema = z.object({
  noNextAction: z.number().int().nonnegative(),
  quiet: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
});
export type ReviewCounts = z.infer<typeof ReviewCountsSchema>;

export const ReviewPageSchema = ListPageMetaSchema.extend({
  today: z.string().date(),
  projects: z.array(ReviewProjectSchema),
  counts: ReviewCountsSchema,
});
export type ReviewPage = z.infer<typeof ReviewPageSchema>;

export const ReviewQuerySchema = ListPageQuerySchema.merge(ViewerTodayQuerySchema);
export type ReviewQuery = z.infer<typeof ReviewQuerySchema>;
