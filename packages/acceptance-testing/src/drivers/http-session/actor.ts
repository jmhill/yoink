import type {
  Actor,
  AnonymousActor,
  Capture,
  Task,
  PasskeyCredentialInfo,
  CreateCaptureInput,
  UpdateCaptureInput,
  CreateTaskInput,
  UpdateTaskInput,
  ProcessCaptureToTaskInput,
} from '../../dsl/index.js';
import {
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  UnsupportedOperationError,
  ConflictError,
  CannotDeleteLastPasskeyError,
} from '../../dsl/index.js';
import type { HttpClient } from '../http/http-client.js';

type SessionActorCredentials = {
  email: string;
  userId: string;
  organizationId: string;
  // No token needed - session cookie is in the client's cookie jar
};

/**
 * HTTP implementation of the Actor interface using session-based auth.
 * Requests are authenticated via session cookie (automatically included by HttpClient).
 */
export const createHttpSessionActor = (
  client: HttpClient,
  credentials: SessionActorCredentials
): Actor => {
  // No auth headers needed - session cookie is automatically included

  const handleCaptureResponse = (
    response: { statusCode: number; body: string; json: <T>() => T },
    captureId?: string
  ): Capture => {
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404 && captureId) {
      throw new NotFoundError('Capture', captureId);
    }
    if (response.statusCode === 400) {
      const error = response.json<{ message?: string }>();
      throw new ValidationError(error.message ?? 'Invalid request');
    }
    return response.json<Capture>();
  };

  return {
    email: credentials.email,
    userId: credentials.userId,
    organizationId: credentials.organizationId,

    async createCapture(input: CreateCaptureInput): Promise<Capture> {
      const response = await client.post('/api/captures', input);
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to create capture: ${response.body}`);
      }
      return response.json<Capture>();
    },

    async listCaptures(): Promise<Capture[]> {
      const response = await client.get('/api/captures?status=inbox&snoozed=false');
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ captures: Capture[] }>().captures;
    },

    async listTrashedCaptures(): Promise<Capture[]> {
      const response = await client.get('/api/captures?status=trashed');
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ captures: Capture[] }>().captures;
    },

    async getCapture(id: string): Promise<Capture> {
      const response = await client.get(`/api/captures/${id}`);
      return handleCaptureResponse(response, id);
    },

    async updateCapture(
      id: string,
      input: UpdateCaptureInput
    ): Promise<Capture> {
      const response = await client.patch(`/api/captures/${id}`, input);
      return handleCaptureResponse(response, id);
    },

    async trashCapture(id: string): Promise<Capture> {
      const response = await client.post(`/api/captures/${id}/trash`, {});
      return handleCaptureResponse(response, id);
    },

    async restoreCapture(id: string): Promise<Capture> {
      const response = await client.post(`/api/captures/${id}/restore`, {});
      return handleCaptureResponse(response, id);
    },

    async snoozeCapture(id: string, until: string): Promise<Capture> {
      const response = await client.post(`/api/captures/${id}/snooze`, { until });
      return handleCaptureResponse(response, id);
    },

    async unsnoozeCapture(id: string): Promise<Capture> {
      const response = await client.post(`/api/captures/${id}/unsnooze`, {});
      return handleCaptureResponse(response, id);
    },

    async listSnoozedCaptures(): Promise<Capture[]> {
      const response = await client.get('/api/captures?status=inbox&snoozed=true');
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ captures: Capture[] }>().captures;
    },

    async deleteCapture(id: string): Promise<void> {
      const response = await client.delete(`/api/captures/${id}`);
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Capture', id);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode === 409) {
        const error = response.json<{ message?: string }>();
        throw new ConflictError(error.message ?? 'Capture must be in trash before deletion');
      }
      // 204 No Content is success
    },

    async emptyTrash(): Promise<{ deletedCount: number }> {
      const response = await client.post('/api/captures/trash/empty', {});
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ deletedCount: number }>();
    },

    // Process capture to task
    async processCaptureToTask(captureId: string, input?: ProcessCaptureToTaskInput): Promise<Task> {
      const response = await client.post(
        `/api/captures/${captureId}/process`,
        { type: 'task', data: input ?? {} }
      );
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Capture', captureId);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to process capture: ${response.body}`);
      }
      return response.json<Task>();
    },

    // Task operations
    async createTask(input: CreateTaskInput): Promise<Task> {
      const response = await client.post('/api/tasks', input);
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      if (response.statusCode !== 201) {
        throw new Error(`Failed to create task: ${response.body}`);
      }
      return response.json<Task>();
    },

    async listTasks(filter?: 'today' | 'upcoming' | 'all' | 'completed'): Promise<Task[]> {
      const query = filter ? `?filter=${filter}` : '';
      const response = await client.get(`/api/tasks${query}`);
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ tasks: Task[] }>().tasks;
    },

    async getTask(id: string): Promise<Task> {
      const response = await client.get(`/api/tasks/${id}`);
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      return response.json<Task>();
    },

    async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
      const response = await client.patch(`/api/tasks/${id}`, input);
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      if (response.statusCode === 400) {
        const error = response.json<{ message?: string }>();
        throw new ValidationError(error.message ?? 'Invalid request');
      }
      return response.json<Task>();
    },

    async completeTask(id: string): Promise<Task> {
      const response = await client.post(`/api/tasks/${id}/complete`, {});
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async uncompleteTask(id: string): Promise<Task> {
      const response = await client.post(`/api/tasks/${id}/uncomplete`, {});
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async pinTask(id: string): Promise<Task> {
      const response = await client.post(`/api/tasks/${id}/pin`, {});
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async unpinTask(id: string): Promise<Task> {
      const response = await client.post(`/api/tasks/${id}/unpin`, {});
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async deleteTask(id: string): Promise<void> {
      const response = await client.delete(`/api/tasks/${id}`);
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      // 204 No Content is success
    },

    async goToSettings(): Promise<void> {
      throw new UnsupportedOperationError('goToSettings', 'http-session');
    },

    async logout(): Promise<void> {
      const response = await client.post('/api/auth/logout', {});
      if (response.statusCode !== 200) {
        throw new Error(`Logout failed: ${response.body}`);
      }
    },

    async requiresConfiguration(): Promise<boolean> {
      throw new UnsupportedOperationError('requiresConfiguration', 'http-session');
    },

    async shareContent(): Promise<Capture> {
      throw new UnsupportedOperationError('shareContent', 'http-session');
    },

    async goOffline(): Promise<void> {
      throw new UnsupportedOperationError('goOffline', 'http-session');
    },

    async goOnline(): Promise<void> {
      throw new UnsupportedOperationError('goOnline', 'http-session');
    },

    async shouldSeeOfflineWarning(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeOfflineWarning', 'http-session');
    },

    async shouldNotSeeOfflineWarning(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeOfflineWarning', 'http-session');
    },

    async shouldBeAbleToAddCaptures(): Promise<void> {
      throw new UnsupportedOperationError('shouldBeAbleToAddCaptures', 'http-session');
    },

    async shouldNotBeAbleToAddCaptures(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotBeAbleToAddCaptures', 'http-session');
    },

    // Passkey operations - session driver doesn't support passkey registration
    // (would need WebAuthn mock, which we only do during signup)
    async registerPasskey(_name?: string): Promise<PasskeyCredentialInfo> {
      throw new UnsupportedOperationError('registerPasskey', 'http-session');
    },

    async listPasskeys(): Promise<PasskeyCredentialInfo[]> {
      const response = await client.get('/api/auth/passkey/credentials');
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ credentials: PasskeyCredentialInfo[] }>().credentials;
    },

    async deletePasskey(credentialId: string): Promise<void> {
      const response = await client.delete(`/api/auth/passkey/credentials/${credentialId}`);
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Passkey', credentialId);
      }
      if (response.statusCode === 403) {
        throw new UnauthorizedError('You do not own this passkey');
      }
      if (response.statusCode === 409) {
        throw new CannotDeleteLastPasskeyError();
      }
      // 200 is success
    },

    async getSessionInfo(): Promise<{ user: { id: string; email: string }; organizationId: string }> {
      const response = await client.get('/api/auth/session');
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ user: { id: string; email: string }; organizationId: string }>();
    },
  };
};

/**
 * HTTP implementation of AnonymousActor using session-based auth.
 * All requests are made without authentication and should throw UnauthorizedError.
 */
export const createHttpSessionAnonymousActor = (client: HttpClient): AnonymousActor => ({
  async createCapture(input: CreateCaptureInput): Promise<Capture> {
    const response = await client.post('/api/captures', input);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    // Shouldn't get here, but handle it
    return response.json<Capture>();
  },

  async listCaptures(): Promise<Capture[]> {
    const response = await client.get('/api/captures');
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    return response.json<{ captures: Capture[] }>().captures;
  },

  async getCapture(id: string): Promise<Capture> {
    const response = await client.get(`/api/captures/${id}`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Capture', id);
    }
    return response.json<Capture>();
  },
});
