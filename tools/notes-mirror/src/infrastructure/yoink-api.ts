import { err, ok, type Result } from 'neverthrow';
import type { ChangedPage, ImportedNote, NotesMirrorApi } from '../application/run-mirror.js';
import type { FeedChange } from '../domain/plan-mirror-pass.js';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null;

const isResponseLike = (
  value: unknown
): value is { ok: boolean; status: number; json: () => Promise<unknown> } =>
  isRecord(value) &&
  typeof value.ok === 'boolean' &&
  typeof value.status === 'number' &&
  typeof value.json === 'function';

const readString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const toChange = (value: unknown): FeedChange | null => {
  if (!isRecord(value)) {
    return null;
  }
  const kind = readString(value.kind);
  const id = readString(value.id);
  const projectId = readString(value.projectId);
  const projectName = readString(value.projectName);
  if (!id || !projectId || !projectName) {
    return null;
  }
  if (kind === 'deleted') {
    const createdAt = readString(value.createdAt);
    const deletedAt = readString(value.deletedAt);
    if (!createdAt || !deletedAt) {
      return null;
    }
    return { kind, id, projectId, projectName, createdAt, deletedAt };
  }
  if (kind !== 'upserted') {
    return null;
  }
  const title = readString(value.title);
  const body = readString(value.body);
  const version = readString(value.version);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  if (!title || body === null || !version || !createdAt || !updatedAt) {
    return null;
  }
  return { kind, id, projectId, projectName, title, body, version, createdAt, updatedAt };
};

const toImported = (value: unknown): ImportedNote | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value.id);
  const projectId = readString(value.projectId);
  const title = readString(value.title);
  const body = readString(value.body);
  const version = readString(value.version);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  if (!id || !projectId || !title || body === null || !version || !createdAt || !updatedAt) {
    return null;
  }
  return { id, projectId, title, body, version, createdAt, updatedAt };
};

export const createYoinkApi = (input: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): NotesMirrorApi => {
  const fetchImpl = input.fetchImpl ?? fetch;
  const request = async (
    method: string,
    urlPath: string,
    body?: Record<string, unknown>
  ): Promise<Result<unknown, string>> => {
    const response = await fetchImpl(new URL(urlPath, input.baseUrl), {
      method,
      headers: {
        authorization: `Bearer ${input.token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }).catch((cause: unknown) => cause);

    if (response instanceof Error || typeof response === 'string') {
      return err(response instanceof Error ? response.message : response);
    }
    if (!isResponseLike(response)) {
      return err('Yoink API request failed');
    }

    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        isRecord(json) && typeof json.message === 'string'
          ? json.message
          : `Yoink API ${response.status}`;
      return err(message);
    }
    return ok(json);
  };

  return {
    listChanged: async ({ since, cursor }) => {
      const query = new URLSearchParams({ since });
      if (cursor) {
        query.set('cursor', cursor);
      }
      const result = await request('GET', `/api/notes/changed?${query.toString()}`);
      if (result.isErr()) {
        return err(result.error);
      }
      if (!isRecord(result.value) || !Array.isArray(result.value.changes)) {
        return err('Changed-since response was not a page of note changes');
      }
      const changes = result.value.changes
        .map(toChange)
        .filter((change): change is FeedChange => change !== null);
      const page: ChangedPage = {
        changes,
        hasMore: result.value.hasMore === true,
        nextCursor: readString(result.value.nextCursor),
      };
      return ok(page);
    },
    importNote: async (payload) => {
      const result = await request('POST', '/api/notes/import', payload);
      if (result.isErr()) {
        return err(result.error);
      }
      const imported = toImported(result.value);
      return imported ? ok(imported) : err('Import response was not a note');
    },
  };
};
