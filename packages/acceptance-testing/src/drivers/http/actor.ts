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
import type { HttpClient } from './http-client.js';

type ActorCredentials = {
  email: string;
  userId: string;
  organizationId: string;
  token: string;
};

/**
 * HTTP implementation of the Actor interface.
 * All requests are authenticated with the provided token.
 */
export const createHttpActor = (
  client: HttpClient,
  credentials: ActorCredentials
): Actor => {
  const authHeaders = () => ({
    authorization: `Bearer ${credentials.token}`,
  });

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
      const response = await client.post('/api/captures', input, authHeaders());
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
      const response = await client.get('/api/captures?status=inbox&snoozed=false', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ captures: Capture[] }>().captures;
    },

    async listTrashedCaptures(): Promise<Capture[]> {
      const response = await client.get('/api/captures?status=trashed', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ captures: Capture[] }>().captures;
    },

    async getCapture(id: string): Promise<Capture> {
      const response = await client.get(`/api/captures/${id}`, authHeaders());
      return handleCaptureResponse(response, id);
    },

    async updateCapture(
      id: string,
      input: UpdateCaptureInput
    ): Promise<Capture> {
      const response = await client.patch(
        `/api/captures/${id}`,
        input,
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async trashCapture(id: string): Promise<Capture> {
      const response = await client.post(
        `/api/captures/${id}/trash`,
        {},
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async restoreCapture(id: string): Promise<Capture> {
      const response = await client.post(
        `/api/captures/${id}/restore`,
        {},
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async snoozeCapture(id: string, until: string): Promise<Capture> {
      const response = await client.post(
        `/api/captures/${id}/snooze`,
        { until },
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async unsnoozeCapture(id: string): Promise<Capture> {
      const response = await client.post(
        `/api/captures/${id}/unsnooze`,
        {},
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async listSnoozedCaptures(): Promise<Capture[]> {
      const response = await client.get('/api/captures?status=inbox&snoozed=true', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ captures: Capture[] }>().captures;
    },

    async deleteCapture(id: string): Promise<void> {
      const response = await client.delete(`/api/captures/${id}`, authHeaders());
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
      const response = await client.post('/api/captures/trash/empty', {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ deletedCount: number }>();
    },

    // Process capture to task
    async processCaptureToTask(captureId: string, input?: ProcessCaptureToTaskInput): Promise<Task> {
      const response = await client.post(
        `/api/captures/${captureId}/process`,
        { type: 'task', data: input ?? {} },
        authHeaders()
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
      const response = await client.post('/api/tasks', input, authHeaders());
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
      const response = await client.get(`/api/tasks${query}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ tasks: Task[] }>().tasks;
    },

    async getTask(id: string): Promise<Task> {
      const response = await client.get(`/api/tasks/${id}`, authHeaders());
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
      const response = await client.patch(`/api/tasks/${id}`, input, authHeaders());
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
      const response = await client.post(`/api/tasks/${id}/complete`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async uncompleteTask(id: string): Promise<Task> {
      const response = await client.post(`/api/tasks/${id}/uncomplete`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async pinTask(id: string): Promise<Task> {
      const response = await client.post(`/api/tasks/${id}/pin`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async unpinTask(id: string): Promise<Task> {
      const response = await client.post(`/api/tasks/${id}/unpin`, {}, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      return response.json<Task>();
    },

    async deleteTask(id: string): Promise<void> {
      const response = await client.delete(`/api/tasks/${id}`, authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      if (response.statusCode === 404) {
        throw new NotFoundError('Task', id);
      }
      // 204 No Content is success
    },

    async goToSettings(): Promise<void> {
      throw new UnsupportedOperationError('goToSettings', 'http');
    },

    async logout(): Promise<void> {
      throw new UnsupportedOperationError('logout', 'http');
    },

    async requiresConfiguration(): Promise<boolean> {
      throw new UnsupportedOperationError('requiresConfiguration', 'http');
    },

    async shareContent(): Promise<Capture> {
      throw new UnsupportedOperationError('shareContent', 'http');
    },

    async goOffline(): Promise<void> {
      throw new UnsupportedOperationError('goOffline', 'http');
    },

    async goOnline(): Promise<void> {
      throw new UnsupportedOperationError('goOnline', 'http');
    },

    async shouldSeeOfflineWarning(): Promise<void> {
      throw new UnsupportedOperationError('shouldSeeOfflineWarning', 'http');
    },

    async shouldNotSeeOfflineWarning(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotSeeOfflineWarning', 'http');
    },

    async shouldBeAbleToAddCaptures(): Promise<void> {
      throw new UnsupportedOperationError('shouldBeAbleToAddCaptures', 'http');
    },

    async shouldNotBeAbleToAddCaptures(): Promise<void> {
      throw new UnsupportedOperationError('shouldNotBeAbleToAddCaptures', 'http');
    },

    // Passkey operations
    async registerPasskey(_name?: string): Promise<PasskeyCredentialInfo> {
      // WebAuthn registration requires browser-level interaction or server-side mocking.
      // For full passkey testing, use the Playwright driver with CDP virtual authenticator.
      throw new UnsupportedOperationError('registerPasskey', 'http');
    },

    async listPasskeys(): Promise<PasskeyCredentialInfo[]> {
      const response = await client.get('/api/auth/passkey/credentials', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ credentials: PasskeyCredentialInfo[] }>().credentials;
    },

    async deletePasskey(credentialId: string): Promise<void> {
      const response = await client.delete(`/api/auth/passkey/credentials/${credentialId}`, authHeaders());
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
  };
};

/**
 * HTTP implementation of AnonymousActor.
 * All requests are made without authentication and should throw UnauthorizedError.
 */
export const createHttpAnonymousActor = (client: HttpClient): AnonymousActor => ({
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
