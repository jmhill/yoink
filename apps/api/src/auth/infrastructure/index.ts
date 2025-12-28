// Token stores (auth-specific)
export { createSqliteTokenStore } from './sqlite-token-store.js';
export { createFakeTokenStore } from './fake-token-store.js';

// Passkey credential stores
export { createSqlitePasskeyCredentialStore } from './sqlite-passkey-credential-store.js';
export {
  createFakePasskeyCredentialStore,
  type FakePasskeyCredentialStoreOptions,
} from './fake-passkey-credential-store.js';

// User session stores
export { createSqliteUserSessionStore } from './sqlite-user-session-store.js';
export {
  createFakeUserSessionStore,
  type FakeUserSessionStoreOptions,
} from './fake-user-session-store.js';

// Seeding (still uses the stores, to be refactored)
export { seedAuthData, type SeedDependencies } from './seed.js';
