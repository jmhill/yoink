import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { ReviewNextAction } from '@yoink/api-contracts';
import { parseProjectRow } from '../../projects/infrastructure/parse-project-row.js';
import { storageError, type StorageError } from '../domain/review-errors.js';
import type { ReviewCandidate } from '../domain/build-review.js';

const NextActionFieldsSchema = z.object({
  review_last_change_at: z.string().min(1),
  next_action_id: z.string().nullable().optional(),
  next_action_title: z.string().nullable().optional(),
  next_action_due_date: z.string().nullable().optional(),
});

const nextActionFromRow = (
  parsed: z.infer<typeof NextActionFieldsSchema>
): ReviewNextAction | null => {
  if (parsed.next_action_id === null || parsed.next_action_id === undefined) {
    return null;
  }
  if (parsed.next_action_title === null || parsed.next_action_title === undefined) {
    return null;
  }
  return {
    id: parsed.next_action_id,
    title: parsed.next_action_title,
    dueDate: parsed.next_action_due_date ?? null,
  };
};

export const parseReviewCandidateRow = (
  row: Record<string, unknown>
): Result<ReviewCandidate, StorageError> => {
  const project = parseProjectRow(row);
  if (project.isErr()) {
    return err(storageError('Invalid review project row', project.error));
  }
  const extra = NextActionFieldsSchema.safeParse(row);
  if (!extra.success) {
    return err(storageError('Invalid review last-change row', extra.error));
  }
  return ok({
    project: project.value,
    lastChangeAt: extra.data.review_last_change_at,
    nextAction: nextActionFromRow(extra.data),
  });
};
