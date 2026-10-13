import { describe, it, expect } from 'vitest';
import { createYoinkApi } from './yoink-api.js';

const jsonResponse = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

describe('createYoinkApi', () => {
  it('maps a 409 import to NOTE_SYNC_CONFLICT', async () => {
    const api = createYoinkApi({
      baseUrl: 'https://yoink.example/',
      token: 'tok',
      fetchImpl: async () =>
        jsonResponse(409, {
          code: 'NOTE_SYNC_CONFLICT',
          message: 'This note changed in Yoink since the Obsidian file was last synced',
        }),
    });
    const result = await api.importNote({
      projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      noteId: 'a1b2c3d4-e5f6-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Meeting notes',
      body: 'From Obsidian',
      baseVersion: '1',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('NOTE_SYNC_CONFLICT');
    }
  });
});
