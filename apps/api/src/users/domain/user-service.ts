import type { ResultAsync } from 'neverthrow';
import type { User } from './user.js';
import type { UserStore } from './user-store.js';
import type { UserServiceError } from './user-errors.js';

// ============================================================================
// Commands (input types)
// ============================================================================

export type CreateUserCommand = {
  id: string;
  organizationId: string;
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
   * Get all users belonging to an organization.
   */
  getUsersByOrganization(organizationId: string): ResultAsync<User[], UserServiceError>;

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

    getUsersByOrganization(organizationId: string): ResultAsync<User[], UserServiceError> {
      return userStore.findByOrganizationId(organizationId);
    },

    createUser(command: CreateUserCommand): ResultAsync<User, UserServiceError> {
      const user: User = {
        id: command.id,
        organizationId: command.organizationId,
        email: command.email,
        createdAt: command.createdAt,
      };

      return userStore.save(user).map(() => user);
    },
  };
};
