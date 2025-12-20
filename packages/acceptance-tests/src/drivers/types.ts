import type { Actor, AnonymousActor, Admin, Health } from '../dsl/index.js';

/**
 * Capabilities that a driver can provide.
 * Tests declare which capabilities they need, allowing them to run
 * against multiple driver implementations.
 */
export type DriverCapability = 'http' | 'playwright';

/**
 * Configuration for creating a driver.
 */
export type DriverConfig = {
  baseUrl: string;
  adminPassword: string;
};

/**
 * A driver provides implementations of DSL interfaces for a specific
 * transport mechanism (HTTP, browser via Playwright, etc.)
 */
export type Driver = {
  /** Driver name for logging/debugging */
  readonly name: string;

  /** Capabilities this driver provides */
  readonly capabilities: DriverCapability[];

  /** Admin operations namespace */
  readonly admin: Admin;

  /** Health check operations */
  readonly health: Health;

  /**
   * Create an authenticated actor.
   * Internally creates an isolated tenant (org, user, token) for this actor.
   */
  createActor(email: string): Promise<Actor>;

  /**
   * Create an unauthenticated actor.
   * All operations will throw UnauthorizedError.
   */
  createAnonymousActor(): AnonymousActor;

  /**
   * Initialize the driver (verify connectivity, etc.)
   */
  setup(): Promise<void>;

  /**
   * Clean up resources.
   */
  teardown(): Promise<void>;
};
