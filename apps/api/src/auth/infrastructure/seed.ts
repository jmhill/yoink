import type { Clock, IdGenerator, PasswordHasher } from '@yoink/infrastructure';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { UserStore } from '../domain/user-store.js';
import type { TokenStore } from '../domain/token-store.js';

// Use the same UUIDs as the hardcoded auth context for backward compatibility
const SEED_ORG_ID = '550e8400-e29b-41d4-a716-446655440001';
const SEED_USER_ID = '550e8400-e29b-41d4-a716-446655440002';

export type SeedDependencies = {
  seedToken: string | undefined;
  organizationStore: OrganizationStore;
  userStore: UserStore;
  tokenStore: TokenStore;
  passwordHasher: PasswordHasher;
  idGenerator: IdGenerator;
  clock: Clock;
  silent?: boolean;
};

export const seedAuthData = async (deps: SeedDependencies): Promise<void> => {
  const {
    seedToken,
    organizationStore,
    userStore,
    tokenStore,
    passwordHasher,
    idGenerator,
    clock,
  } = deps;

  // Skip if no seed token configured
  if (!seedToken) {
    return;
  }

  // Skip if tokens already exist (seeding already done)
  const hasTokensResult = await tokenStore.hasAnyTokens();
  if (hasTokensResult.isErr()) {
    throw new Error('Failed to check for existing tokens during seeding');
  }
  if (hasTokensResult.value) {
    return;
  }

  const now = clock.now().toISOString();

  // Create default organization
  const saveOrgResult = await organizationStore.save({
    id: SEED_ORG_ID,
    name: 'My Captures',
    createdAt: now,
  });
  if (saveOrgResult.isErr()) {
    throw new Error('Failed to seed organization');
  }

  // Create default user
  const saveUserResult = await userStore.save({
    id: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    email: 'seed@localhost',
    createdAt: now,
  });
  if (saveUserResult.isErr()) {
    throw new Error('Failed to seed user');
  }

  // Create API token with hashed seed value
  const tokenId = idGenerator.generate();
  const tokenHash = await passwordHasher.hash(seedToken);
  const saveTokenResult = await tokenStore.save({
    id: tokenId,
    userId: SEED_USER_ID,
    tokenHash,
    name: 'seed-token',
    createdAt: now,
  });
  if (saveTokenResult.isErr()) {
    throw new Error('Failed to seed API token');
  }

  // Log the full token for the user (tokenId:secret format)
  if (!deps.silent) {
    console.log(`Seeded API token: ${tokenId}:${seedToken}`);
  }
};
