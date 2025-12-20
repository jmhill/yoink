const STORAGE_KEYS = {
  apiUrl: 'yoink_api_url',
  token: 'yoink_token',
} as const;

export type ExtensionConfig = {
  apiUrl: string | null;
  token: string | null;
};

export const storage = {
  async get(): Promise<ExtensionConfig> {
    const result = await chrome.storage.sync.get([
      STORAGE_KEYS.apiUrl,
      STORAGE_KEYS.token,
    ]);

    return {
      apiUrl: (result[STORAGE_KEYS.apiUrl] as string) ?? null,
      token: (result[STORAGE_KEYS.token] as string) ?? null,
    };
  },

  async set(config: ExtensionConfig): Promise<void> {
    const items: Record<string, string> = {};

    if (config.apiUrl !== null) {
      items[STORAGE_KEYS.apiUrl] = config.apiUrl;
    }
    if (config.token !== null) {
      items[STORAGE_KEYS.token] = config.token;
    }

    await chrome.storage.sync.set(items);
  },

  async remove(): Promise<void> {
    await chrome.storage.sync.remove([STORAGE_KEYS.apiUrl, STORAGE_KEYS.token]);
  },

  async isConfigured(): Promise<boolean> {
    const config = await this.get();
    return (
      config.apiUrl !== null &&
      config.apiUrl.length > 0 &&
      config.token !== null &&
      config.token.length > 0
    );
  },
};
