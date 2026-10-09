import { handleCreateToken } from './handle-create-token.js';
import { handleListTokens } from './handle-list-tokens.js';
import { handleRenameToken } from './handle-rename-token.js';
import { handleRevokeToken } from './handle-revoke-token.js';
import type {
  HashSecret,
  ListOrgTokens,
  ListUserOrgTokens,
  LoadToken,
  PersistTokenEvent,
} from './token-ports.js';

export type TokenHandlerDeps = {
  listOrgTokens: ListOrgTokens;
  listUserOrgTokens: ListUserOrgTokens;
  load: LoadToken;
  persist: PersistTokenEvent;
  hashSecret: HashSecret;
  nextId: () => string;
  nextSecret: () => string;
  now: () => string;
  maxTokensPerUserPerOrg: number;
};

export const createTokenHandlers = (deps: TokenHandlerDeps) => ({
  list: (query: Parameters<typeof handleListTokens>[0]) => handleListTokens(query, deps),
  create: (command: Parameters<typeof handleCreateToken>[0]) =>
    handleCreateToken(command, deps),
  rename: (command: Parameters<typeof handleRenameToken>[0]) =>
    handleRenameToken(command, deps),
  revoke: (command: Parameters<typeof handleRevokeToken>[0]) =>
    handleRevokeToken(command, deps),
});

export type TokenHandlers = ReturnType<typeof createTokenHandlers>;
