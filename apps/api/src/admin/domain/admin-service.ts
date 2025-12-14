import { ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator, PasswordHasher } from '@yoink/infrastructure';
import type { Organization } from '../../auth/domain/organization.js';
import type { User } from '../../auth/domain/user.js';
import type { ApiToken } from '../../auth/domain/api-token.js';
import type { OrganizationStore } from '../../auth/domain/organization-store.js';
import type { UserStore } from '../../auth/domain/user-store.js';
import type { TokenStore } from '../../auth/domain/token-store.js';
import type {
  AdminServiceError,
  OrganizationStorageError,
  UserStorageError,
  TokenStorageError,
} from './admin-errors.js';

export type AdminServiceDependencies = {
  organizationStore: OrganizationStore;
  userStore: UserStore;
  tokenStore: TokenStore;
  clock: Clock;
  idGenerator: IdGenerator;
  passwordHasher: PasswordHasher;
};

export type CreateTokenResult = {
  token: ApiTokenView; // View without hash, not full ApiToken
  rawToken: string; // The full tokenId:secret value
};

// API token without the hash (for external API responses)
export type ApiTokenView = Omit<ApiToken, 'tokenHash'>;

export type AdminService = {
  // Organizations
  listOrganizations(): ResultAsync<Organization[], OrganizationStorageError>;
  getOrganization(id: string): ResultAsync<Organization | null, OrganizationStorageError>;
  createOrganization(name: string): ResultAsync<Organization, OrganizationStorageError>;

  // Users
  listUsers(organizationId: string): ResultAsync<User[], UserStorageError>;
  getUser(id: string): ResultAsync<User | null, UserStorageError>;
  createUser(organizationId: string, email: string): ResultAsync<User, UserStorageError>;

  // Tokens
  listTokens(userId: string): ResultAsync<ApiTokenView[], TokenStorageError>;
  createToken(userId: string, name: string): ResultAsync<CreateTokenResult, AdminServiceError>;
  revokeToken(id: string): ResultAsync<void, TokenStorageError>;
};

const toApiTokenView = (token: ApiToken): ApiTokenView => {
  const { tokenHash: _hash, ...view } = token;
  return view;
};

export const createAdminService = (
  deps: AdminServiceDependencies
): AdminService => {
  const {
    organizationStore,
    userStore,
    tokenStore,
    clock,
    idGenerator,
    passwordHasher,
  } = deps;

  return {
    // Organizations
    listOrganizations() {
      return organizationStore.findAll();
    },

    getOrganization(id: string) {
      return organizationStore.findById(id);
    },

    createOrganization(name: string) {
      const organization: Organization = {
        id: idGenerator.generate(),
        name,
        createdAt: clock.now().toISOString(),
      };

      return organizationStore.save(organization).map(() => organization);
    },

    // Users
    listUsers(organizationId: string) {
      return userStore.findByOrganizationId(organizationId);
    },

    getUser(id: string) {
      return userStore.findById(id);
    },

    createUser(organizationId: string, email: string) {
      const user: User = {
        id: idGenerator.generate(),
        organizationId,
        email,
        createdAt: clock.now().toISOString(),
      };

      return userStore.save(user).map(() => user);
    },

    // Tokens
    listTokens(userId: string) {
      return tokenStore.findByUserId(userId).map((tokens) => tokens.map(toApiTokenView));
    },

    createToken(userId: string, name: string): ResultAsync<CreateTokenResult, AdminServiceError> {
      const tokenId = idGenerator.generate();
      const secret = idGenerator.generate(); // Use UUID as secret for sufficient entropy

      // We need to hash the secret, but passwordHasher.hash returns a Promise
      // Wrap it in ResultAsync
      return ResultAsync.fromPromise(
        passwordHasher.hash(secret),
        (error) => ({
          type: 'TOKEN_STORAGE_ERROR' as const,
          message: 'Failed to hash token secret',
          cause: error,
        })
      ).andThen((tokenHash) => {
        const token: ApiToken = {
          id: tokenId,
          userId,
          tokenHash,
          name,
          createdAt: clock.now().toISOString(),
        };

        return tokenStore.save(token).map(() => ({
          token: toApiTokenView(token),
          rawToken: `${tokenId}:${secret}`,
        }));
      });
    },

    revokeToken(id: string) {
      return tokenStore.delete(id);
    },
  };
};
