import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { UserSession } from '../domain/user-session.js';
import type { UserSessionStore } from '../domain/user-session-store.js';
import {
  sessionStorageError,
  type SessionStorageError,
} from '../domain/auth-errors.js';

export type FakeUserSessionStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  shouldFailOnUpdate?: boolean;
  shouldFailOnDelete?: boolean;
  initialSessions?: UserSession[];
};

export const createFakeUserSessionStore = (
  options: FakeUserSessionStoreOptions = {}
): UserSessionStore & { getAll(): UserSession[] } => {
  const sessions: UserSession[] = [...(options.initialSessions ?? [])];

  return {
    /** Test helper to get all stored sessions */
    getAll: () => [...sessions],

    save: (session: UserSession): ResultAsync<void, SessionStorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(sessionStorageError('Save failed'));
      }
      sessions.push(session);
      return okAsync(undefined);
    },

    findById: (sessionId: string): ResultAsync<UserSession | null, SessionStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(sessionStorageError('Find failed'));
      }
      const found = sessions.find((s) => s.id === sessionId);
      return okAsync(found ?? null);
    },

    findByUserId: (userId: string): ResultAsync<UserSession[], SessionStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(sessionStorageError('Find failed'));
      }
      const found = sessions
        .filter((s) => s.userId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return okAsync(found);
    },

    updateLastActive: (
      sessionId: string,
      timestamp: string
    ): ResultAsync<void, SessionStorageError> => {
      if (options.shouldFailOnUpdate) {
        return errAsync(sessionStorageError('Update failed'));
      }
      const index = sessions.findIndex((s) => s.id === sessionId);
      if (index >= 0) {
        sessions[index] = { ...sessions[index], lastActiveAt: timestamp };
      }
      return okAsync(undefined);
    },

    updateCurrentOrganization: (
      sessionId: string,
      organizationId: string
    ): ResultAsync<void, SessionStorageError> => {
      if (options.shouldFailOnUpdate) {
        return errAsync(sessionStorageError('Update failed'));
      }
      const index = sessions.findIndex((s) => s.id === sessionId);
      if (index >= 0) {
        sessions[index] = { ...sessions[index], currentOrganizationId: organizationId };
      }
      return okAsync(undefined);
    },

    delete: (sessionId: string): ResultAsync<void, SessionStorageError> => {
      if (options.shouldFailOnDelete) {
        return errAsync(sessionStorageError('Delete failed'));
      }
      const index = sessions.findIndex((s) => s.id === sessionId);
      if (index >= 0) {
        sessions.splice(index, 1);
      }
      return okAsync(undefined);
    },

    deleteByUserId: (userId: string): ResultAsync<void, SessionStorageError> => {
      if (options.shouldFailOnDelete) {
        return errAsync(sessionStorageError('Delete failed'));
      }
      // Remove all sessions for the user (iterate backwards to safely remove)
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (sessions[i].userId === userId) {
          sessions.splice(i, 1);
        }
      }
      return okAsync(undefined);
    },

    deleteExpired: (now: string): ResultAsync<number, SessionStorageError> => {
      if (options.shouldFailOnDelete) {
        return errAsync(sessionStorageError('Delete failed'));
      }
      const nowDate = new Date(now);
      let deletedCount = 0;
      // Remove expired sessions (iterate backwards to safely remove)
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (new Date(sessions[i].expiresAt) < nowDate) {
          sessions.splice(i, 1);
          deletedCount++;
        }
      }
      return okAsync(deletedCount);
    },
  };
};
