import type { ResultAsync } from 'neverthrow';
import type { User } from './user.js';
import type { UserStore } from './user-store.js';
import type { UserServiceError } from './user-errors.js';

// ============================================================================
// Commands (input types)
// ============================================================================

export type CreateUserCommand = {
  id: string;
  email: string;
  createdAt: string;
};

// ============================================================================
// Service Interface
// ============================================================================

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

// ============================================================================
// Dependencies
// ============================================================================

export type UserServiceDependencies = {
  userStore: UserStore;
};

// ============================================================================
// Implementation
// ============================================================================

export const createUserService = (deps: UserServiceDependencies): UserService => {
  const { userStore } = deps;

  return {
    getUser(userId: string): ResultAsync<User | null, UserServiceError> {
      return userStore.findById(userId);
    },

    getUserByEmail(email: string): ResultAsync<User | null, UserServiceError> {
      return userStore.findByEmail(email);
    },

    getUsersByIds(userIds: string[]): ResultAsync<User[], UserServiceError> {
      return userStore.findByIds(userIds);
    },

    createUser(command: CreateUserCommand): ResultAsync<User, UserServiceError> {
      const user: User = {
        id: command.id,
        email: command.email,
        createdAt: command.createdAt,
      };

      return userStore.save(user).map(() => user);
    },
  };
};
