// DSL - Domain types and errors
export type {
  Capture,
  Organization,
  User,
  Token,
  CreateCaptureInput,
  UpdateCaptureInput,
  CreateTokenResult,
  HealthStatus,
} from './dsl/index.js';

export {
  DslError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  UnsupportedOperationError,
  ConflictError,
  CannotDeleteLastPasskeyError,
  CannotLeavePersonalOrgError,
  LastAdminError,
  NotMemberError,
  ForbiddenError,
  CannotRemoveSelfError,
  TokenLimitReachedError,
} from './dsl/index.js';

export type {
  Actor,
  CoreActor,
  BrowserActor,
  BrowserActorOperations,
  AnonymousActor,
} from './dsl/index.js';

export type { Admin } from './dsl/index.js';
export type { Health } from './dsl/index.js';

// Drivers
export type { Driver, DriverConfig, DriverCapability } from './drivers/index.js';
export { createHttpDriver, createPlaywrightDriver, getDriver } from './drivers/index.js';

// Harness - test utilities
export {
  usingDrivers,
  expect,
  it,
  describe,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from './harness.js';

export type {
  ActorCredentials,
  BaseContext,
  HttpContext,
  PlaywrightContext,
} from './harness.js';

// Config
export { getTestConfig } from './config.js';
