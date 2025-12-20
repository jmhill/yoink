import type {
  Actor,
  AnonymousActor,
  Capture,
  CreateCaptureInput,
  UpdateCaptureInput,
} from '../../dsl/index.js';
import {
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  UnsupportedOperationError,
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
      const response = await client.get('/api/captures?status=inbox', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ captures: Capture[] }>().captures;
    },

    async listArchivedCaptures(): Promise<Capture[]> {
      const response = await client.get('/api/captures?status=archived', authHeaders());
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

    async archiveCapture(id: string): Promise<Capture> {
      const response = await client.patch(
        `/api/captures/${id}`,
        { status: 'archived' },
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async unarchiveCapture(id: string): Promise<Capture> {
      const response = await client.patch(
        `/api/captures/${id}`,
        { status: 'inbox' },
        authHeaders()
      );
      return handleCaptureResponse(response, id);
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

    async isOfflineBannerVisible(): Promise<boolean> {
      throw new UnsupportedOperationError('isOfflineBannerVisible', 'http');
    },

    async isQuickAddDisabled(): Promise<boolean> {
      throw new UnsupportedOperationError('isQuickAddDisabled', 'http');
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
