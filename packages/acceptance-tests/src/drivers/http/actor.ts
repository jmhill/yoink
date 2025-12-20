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
      const response = await client.post('/captures', input, authHeaders());
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
      const response = await client.get('/captures', authHeaders());
      if (response.statusCode === 401) {
        throw new UnauthorizedError();
      }
      return response.json<{ captures: Capture[] }>().captures;
    },

    async getCapture(id: string): Promise<Capture> {
      const response = await client.get(`/captures/${id}`, authHeaders());
      return handleCaptureResponse(response, id);
    },

    async updateCapture(
      id: string,
      input: UpdateCaptureInput
    ): Promise<Capture> {
      const response = await client.patch(
        `/captures/${id}`,
        input,
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async archiveCapture(id: string): Promise<Capture> {
      const response = await client.patch(
        `/captures/${id}`,
        { status: 'archived' },
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },

    async unarchiveCapture(id: string): Promise<Capture> {
      const response = await client.patch(
        `/captures/${id}`,
        { status: 'inbox' },
        authHeaders()
      );
      return handleCaptureResponse(response, id);
    },
  };
};

/**
 * HTTP implementation of AnonymousActor.
 * All requests are made without authentication and should throw UnauthorizedError.
 */
export const createHttpAnonymousActor = (client: HttpClient): AnonymousActor => ({
  async createCapture(input: CreateCaptureInput): Promise<Capture> {
    const response = await client.post('/captures', input);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    // Shouldn't get here, but handle it
    return response.json<Capture>();
  },

  async listCaptures(): Promise<Capture[]> {
    const response = await client.get('/captures');
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    return response.json<{ captures: Capture[] }>().captures;
  },

  async getCapture(id: string): Promise<Capture> {
    const response = await client.get(`/captures/${id}`);
    if (response.statusCode === 401) {
      throw new UnauthorizedError();
    }
    if (response.statusCode === 404) {
      throw new NotFoundError('Capture', id);
    }
    return response.json<Capture>();
  },
});
