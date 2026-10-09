import { handleCreateToken } from './handle-create-token.js';
import { handleListTokens } from './handle-list-tokens.js';
import { handleRevokeToken } from './handle-revoke-token.js';
import type {
  HashSecret,
  ListUserOrgTokens,
  LoadActorMembership,
  LoadToken,
  LoadTokenOwner,
  PersistTokenCreated,
  PersistTokenRevoked,
} from './token-ports.js';

export type TokenHandlerDeps = {
  listUserOrgTokens: ListUserOrgTokens;
  load: LoadToken;
  loadMembership: LoadActorMembership;
  loadOwner: LoadTokenOwner;
  persistCreate: PersistTokenCreated;
  persistRevoke: PersistTokenRevoked;
  hashSecret: HashSecret;
  nextId: () => string;
  nextSecret: () => string;
  now: () => string;
  maxTokensPerUserPerOrg: number;
};

export const createTokenHandlers = (deps: TokenHandlerDeps) => ({
  list: (query: Parameters<typeof handleListTokens>[0]) =>
    handleListTokens(query, {
      listUserOrgTokens: deps.listUserOrgTokens,
    }),
  create: (command: Parameters<typeof handleCreateToken>[0]) =>
    handleCreateToken(command, deps),
  revoke: (command: Parameters<typeof handleRevokeToken>[0]) =>
    handleRevokeToken(command, {
      load: deps.load,
      persistRevoke: deps.persistRevoke,
      now: deps.now,
    }),
});

export type TokenHandlers = ReturnType<typeof createTokenHandlers>;
