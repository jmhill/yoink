import type { ResultAsync } from 'neverthrow';
import type { CommitFailure, UnitOfWork } from '../../kernel/unit-of-work.js';
import { decideCreateUser, planCreateUser, type CreateUserCommand } from '../domain/decide-create-user.js';
import type { User } from '../domain/user.js';
import type { UserStore } from '../domain/user-store.js';
import { userStorageError, type UserServiceError, type UserStorageError } from '../domain/user-errors.js';
import type { UserPlan } from '../domain/user-plan.js';

export type { CreateUserCommand } from '../domain/decide-create-user.js';

export type UserService = {
  /**
   * Get a user by ID.
   * Returns null if user not found.
   */
  getUser(userId: string): ResultAsync<User | null, UserServiceError>;

  /**
   * Get a user by email address.
   * Returns null if user not found.
   */
  getUserByEmail(email: string): ResultAsync<User | null, UserServiceError>;

  /**
   * Get users by their IDs.
   */
  getUsersByIds(userIds: string[]): ResultAsync<User[], UserServiceError>;

  /**
   * Create a new user.
   */
  createUser(command: CreateUserCommand): ResultAsync<User, UserServiceError>;
};

export type UserServiceDependencies = {
  userStore: UserStore;
  /**
   * The composition root passes the sqlite unit of work. The plan then
   * commits through the access participant. Tests may omit it and apply
   * the same plan through the user store.
   */
  unitOfWork?: UnitOfWork;
};

/**
 * Get, get-by-email, and get-by-ids stay reads. Create takes the command,
 * decides, and commits one user plan. There is no query on that write.
 * The insert is not a guard. Signup's user insert stays the guarded one.
 * Admin create-member and agent mint stay on their plans.
 */
export const createUserService = (deps: UserServiceDependencies): UserService => {
  const persist = (plan: UserPlan): ResultAsync<void, UserStorageError> => {
    if (deps.unitOfWork === undefined) {
      return deps.userStore.save(plan.user);
    }
    return deps.unitOfWork
      .commit([
        {
          result: null,
          events: [],
          step: { owner: 'access', plan },
        },
      ])
      .map(() => undefined)
      .mapErr((failure: CommitFailure) => userStorageError('Failed to save user', failure));
  };

  return {
    getUser(userId: string): ResultAsync<User | null, UserServiceError> {
      return deps.userStore.findById(userId);
    },

    getUserByEmail(email: string): ResultAsync<User | null, UserServiceError> {
      return deps.userStore.findByEmail(email);
    },

    getUsersByIds(userIds: string[]): ResultAsync<User[], UserServiceError> {
      return deps.userStore.findByIds(userIds);
    },

    createUser(command: CreateUserCommand): ResultAsync<User, UserServiceError> {
      const decision = decideCreateUser(command);
      const plan = planCreateUser(decision);
      return persist(plan).map(() => plan.user);
    },
  };
};
