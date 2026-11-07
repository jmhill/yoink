import type { Actor } from './auth-context.js';

/**
 * Published fact another module, a policy, or history can consume.
 * Payload changes inside one schemaVersion are additive. A break is a new version.
 */
export type IntegrationEvent<T extends string = string, P = unknown> = {
  readonly id: string;
  readonly type: T;
  readonly schemaVersion: number;
  readonly organizationId: string;
  readonly occurredAt: string;
  readonly actor: Actor;
  readonly subject: {
    readonly type: string;
    readonly id: string;
    readonly projectId?: string;
  };
  readonly payload: P;
};
