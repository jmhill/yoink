import { ResultAsync } from 'neverthrow';
import type { ListTokensQuery } from '../domain/token-queries.js';
import { toTokenInfo, type TokenListResult, type TokenOwnerInfo } from '../domain/token-info.js';
import { tokenIsVisibleTo } from '../domain/can-manage-token.js';
import type { ListTokensError } from '../domain/token-errors.js';
import type { ListOrgTokens, LoadActorMembership, LoadTokenOwner } from './token-ports.js';

export type HandleListTokensDeps = {
  listOrgTokens: ListOrgTokens;
  loadMembership: LoadActorMembership;
  loadOwner: LoadTokenOwner;
  maxTokensPerUser: number;
};

const fallbackOwner = (userId: string): TokenOwnerInfo => ({
  userId,
  name: null,
  kind: 'human',
});

export const handleListTokens = (
  query: ListTokensQuery,
  deps: HandleListTokensDeps
): ResultAsync<TokenListResult, ListTokensError> => {
  return deps.listOrgTokens(query.organizationId).andThen((orgTokens) =>
    deps.loadMembership(query.userId, query.organizationId).andThen((membership) => {
      const ownerIds = [...new Set(orgTokens.map((token) => token.userId))];
      return ResultAsync.combine(ownerIds.map((id) => deps.loadOwner(id))).map((owners) => {
        const ownersById = new Map<string, TokenOwnerInfo>();
        ownerIds.forEach((id, index) => {
          ownersById.set(id, owners[index] ?? fallbackOwner(id));
        });

        const visible = orgTokens.filter((token) =>
          tokenIsVisibleTo({
            actor: query.actor,
            actorRole: membership?.role ?? null,
            tokenUserId: token.userId,
            tokenOwnerKind: ownersById.get(token.userId)?.kind ?? 'human',
          })
        );

        return {
          tokens: visible.map((token) =>
            toTokenInfo(token, ownersById.get(token.userId) ?? fallbackOwner(token.userId))
          ),
          maxTokensPerUser: deps.maxTokensPerUser,
          ownedCount: orgTokens.filter((token) => token.userId === query.userId).length,
        };
      });
    })
  );
};
