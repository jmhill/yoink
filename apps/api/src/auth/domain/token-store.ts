import type { ApiToken } from './api-token.js';

export type TokenStore = {
  save(token: ApiToken): Promise<void>;
  findById(id: string): Promise<ApiToken | null>;
  updateLastUsed(id: string, timestamp: string): Promise<void>;
  hasAnyTokens(): Promise<boolean>;
};
