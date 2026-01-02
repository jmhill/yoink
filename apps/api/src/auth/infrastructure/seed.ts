import type { Clock, IdGenerator, PasswordHasher, CodeGenerator } from '@yoink/infrastructure';
import type { OrganizationStore } from '../../organizations/domain/organization-store.js';
import type { OrganizationMembershipStore } from '../../organizations/domain/organization-membership-store.js';
import type { InvitationStore } from '../../organizations/domain/invitation-store.js';
import type { UserStore } from '../../users/domain/user-store.js';
import type { TokenStore } from '../domain/token-store.js';

// Use the same UUIDs as the hardcoded auth context for backward compatibility
const SEED_ORG_ID = '550e8400-e29b-41d4-a716-446655440001';
const SEED_USER_ID = '550e8400-e29b-41d4-a716-446655440002';

// Fixed invitation code for dev - makes it predictable for scripting
const SEED_INVITATION_CODE = 'DEVLOCAL';

export type SeedDependencies = {
  seedToken: string | undefined;
  seedInvitationEmail: string | undefined;
  organizationStore: OrganizationStore;
  userStore: UserStore;
  tokenStore: TokenStore;
  membershipStore: OrganizationMembershipStore;
  invitationStore: InvitationStore;
  passwordHasher: PasswordHasher;
  idGenerator: IdGenerator;
  codeGenerator: CodeGenerator;
  clock: Clock;
  silent?: boolean;
};

export type SeedResult = {
  /** The invitation code if one was created */
  invitationCode?: string;
};

export const seedAuthData = async (deps: SeedDependencies): Promise<SeedResult> => {
  const {
    seedToken,
    seedInvitationEmail,
    organizationStore,
    userStore,
    tokenStore,
    membershipStore,
    invitationStore,
    passwordHasher,
    idGenerator,
    clock,
  } = deps;

  // Skip if no seed token configured
  if (!seedToken) {
    return {};
  }

  // Skip if tokens already exist (seeding already done)
  const hasTokensResult = await tokenStore.hasAnyTokens();
  if (hasTokensResult.isErr()) {
    throw new Error('Failed to check for existing tokens during seeding');
  }
  if (hasTokensResult.value) {
    return {};
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

  // Create default user (no organizationId - memberships track org relationships)
  const saveUserResult = await userStore.save({
    id: SEED_USER_ID,
    email: 'seed@localhost',
    createdAt: now,
  });
  if (saveUserResult.isErr()) {
    throw new Error('Failed to seed user');
  }

  // Create membership for the user in the organization
  // This is the user's personal org, so they are the owner
  const membershipId = idGenerator.generate();
  const saveMembershipResult = await membershipStore.save({
    id: membershipId,
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    role: 'owner',
    isPersonalOrg: true,
    joinedAt: now,
  });
  if (saveMembershipResult.isErr()) {
    throw new Error('Failed to seed membership');
  }

  // Create API token with hashed seed value
  const tokenId = idGenerator.generate();
  const tokenHash = await passwordHasher.hash(seedToken);
  const saveTokenResult = await tokenStore.save({
    id: tokenId,
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
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

  // Create invitation for passkey signup if email is configured
  let invitationCode: string | undefined;
  if (seedInvitationEmail) {
    const invitationId = idGenerator.generate();
    invitationCode = SEED_INVITATION_CODE;
    const expiresAt = new Date(clock.now().getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year

    const saveInvitationResult = await invitationStore.save({
      id: invitationId,
      code: invitationCode,
      email: seedInvitationEmail,
      organizationId: SEED_ORG_ID,
      invitedByUserId: SEED_USER_ID,
      role: 'member',
      expiresAt: expiresAt.toISOString(),
      acceptedAt: null,
      acceptedByUserId: null,
      createdAt: now,
    });

    if (saveInvitationResult.isErr()) {
      throw new Error('Failed to seed invitation');
    }

    if (!deps.silent) {
      console.log(`Seeded invitation code: ${invitationCode} (for ${seedInvitationEmail})`);
    }
  }

  return { invitationCode };
};
