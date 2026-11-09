import { err, ok, type Result } from 'neverthrow';
import type { RenameUserPlan } from './admin-plan.js';
import type { User } from './user.js';
import { userNotFoundError, type UserNotFoundError } from './user-errors.js';

export type DecideRenameUserInput = {
  readonly userId: string;
  readonly user: User | null;
  readonly name: string;
};

/** A missing user is not written. The guarded update still covers a race. */
export const decideRenameUser = (
  input: DecideRenameUserInput
): Result<RenameUserPlan, UserNotFoundError> => {
  if (!input.user) {
    return err(userNotFoundError(input.userId));
  }
  return ok({
    kind: 'rename-user',
    userId: input.user.id,
    name: input.name,
  });
};

export const renamedUser = (user: User, name: string): User => ({
  ...user,
  name,
});
