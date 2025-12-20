import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storage, type ExtensionConfig } from './storage';

// Mock chrome.storage.sync
const mockStorageData = new Map<string, unknown>();

const mockChrome = {
  storage: {
    sync: {
      get: vi.fn(
        (
          keys: string | string[]
        ): Promise<Record<string, unknown>> => {
          const keyArray = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          for (const key of keyArray) {
            const value = mockStorageData.get(key);
            if (value !== undefined) {
              result[key] = value;
            }
          }
          return Promise.resolve(result);
        }
      ),
      set: vi.fn((items: Record<string, unknown>): Promise<void> => {
        for (const [key, value] of Object.entries(items)) {
          mockStorageData.set(key, value);
        }
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]): Promise<void> => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const key of keyArray) {
          mockStorageData.delete(key);
        }
        return Promise.resolve();
      }),
    },
  },
};

vi.stubGlobal('chrome', mockChrome);

describe('storage', () => {
  beforeEach(() => {
    mockStorageData.clear();
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('returns null values when no config is stored', async () => {
      const config = await storage.get();

      expect(config).toEqual({
        apiUrl: null,
        token: null,
      });
    });

    it('returns stored config values', async () => {
      mockStorageData.set('yoink_api_url', 'https://api.example.com');
      mockStorageData.set('yoink_token', 'token123:secret');

      const config = await storage.get();

      expect(config).toEqual({
        apiUrl: 'https://api.example.com',
        token: 'token123:secret',
      });
    });

    it('returns partial config when only some values are stored', async () => {
      mockStorageData.set('yoink_api_url', 'https://api.example.com');

      const config = await storage.get();

      expect(config).toEqual({
        apiUrl: 'https://api.example.com',
        token: null,
      });
    });
  });

  describe('set', () => {
    it('stores config values', async () => {
      const config: ExtensionConfig = {
        apiUrl: 'https://api.example.com',
        token: 'token123:secret',
      };

      await storage.set(config);

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        yoink_api_url: 'https://api.example.com',
        yoink_token: 'token123:secret',
      });
    });

    it('stores only non-null values', async () => {
      const config: ExtensionConfig = {
        apiUrl: 'https://api.example.com',
        token: null,
      };

      await storage.set(config);

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        yoink_api_url: 'https://api.example.com',
      });
    });
  });

  describe('remove', () => {
    it('removes all config values', async () => {
      mockStorageData.set('yoink_api_url', 'https://api.example.com');
      mockStorageData.set('yoink_token', 'token123:secret');

      await storage.remove();

      expect(mockChrome.storage.sync.remove).toHaveBeenCalledWith([
        'yoink_api_url',
        'yoink_token',
      ]);
    });
  });

  describe('isConfigured', () => {
    it('returns false when no config is stored', async () => {
      const result = await storage.isConfigured();

      expect(result).toBe(false);
    });

    it('returns false when only apiUrl is stored', async () => {
      mockStorageData.set('yoink_api_url', 'https://api.example.com');

      const result = await storage.isConfigured();

      expect(result).toBe(false);
    });

    it('returns false when only token is stored', async () => {
      mockStorageData.set('yoink_token', 'token123:secret');

      const result = await storage.isConfigured();

      expect(result).toBe(false);
    });

    it('returns true when both apiUrl and token are stored', async () => {
      mockStorageData.set('yoink_api_url', 'https://api.example.com');
      mockStorageData.set('yoink_token', 'token123:secret');

      const result = await storage.isConfigured();

      expect(result).toBe(true);
    });

    it('returns false when apiUrl is empty string', async () => {
      mockStorageData.set('yoink_api_url', '');
      mockStorageData.set('yoink_token', 'token123:secret');

      const result = await storage.isConfigured();

      expect(result).toBe(false);
    });

    it('returns false when token is empty string', async () => {
      mockStorageData.set('yoink_api_url', 'https://api.example.com');
      mockStorageData.set('yoink_token', '');

      const result = await storage.isConfigured();

      expect(result).toBe(false);
    });
  });
});
