import type { Driver, DriverConfig } from '../types.js';
import type { Actor, AnonymousActor } from '../../dsl/index.js';
import { displayNameFromEmail } from '../../dsl/display-name.js';
import { createHttpClient } from './http-client.js';
import { createHttpAdmin } from './admin.js';
import { createHttpHealth } from './health.js';
import { createHttpActor, createHttpAnonymousActor } from './actor.js';

/**
 * Creates an HTTP driver that implements DSL interfaces via REST API calls.
 */
export const createHttpDriver = (config: DriverConfig): Driver => {
  const client = createHttpClient(config.baseUrl);
  const admin = createHttpAdmin(client, config.adminPassword);
  const health = createHttpHealth(client);

  return {
    name: 'http',
    capabilities: ['http'],

    admin,
    health,

    async createActor(email: string): Promise<Actor> {
      // Create an isolated tenant for this actor
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const orgName = `test-org-${suffix}`;
      // Make email unique per actor to satisfy the global email uniqueness constraint
      const [localPart, domain] = email.split('@');
      const uniqueEmail = `${localPart}+${suffix}@${domain}`;

      await admin.login();
      try {
        const org = await admin.createOrganization(orgName);
        // Isolated HTTP tenants start as admin (owner is assigned from the
        // admin panel). Playwright createActor still invites as admin.
        const user = await admin.createUser(org.id, uniqueEmail, {
          role: 'admin',
          name: displayNameFromEmail(email),
        });
        const { rawToken } = await admin.createToken(org.id, user.id, 'test-token');

        return createHttpActor(
          client,
          {
            email,
            userId: user.id,
            organizationId: org.id,
            token: rawToken,
          },
          {
            provisionAgent: async (name) => {
              await admin.login();
              try {
                const agentUser = await admin.createUser(
                  org.id,
                  `agent-setup-${Date.now()}@example.com`,
                  {
                    role: 'member',
                    kind: 'agent',
                    name,
                  }
                );
                const created = await admin.createToken(org.id, agentUser.id, name);
                return {
                  agent: {
                    userId: agentUser.id,
                    name,
                    kind: 'agent',
                    role: 'member',
                  },
                  token: created.token,
                  rawToken: created.rawToken,
                };
              } finally {
                await admin.logout();
              }
            },
          }
        );
      } finally {
        await admin.logout();
      }
    },

    createAnonymousActor(): AnonymousActor {
      return createHttpAnonymousActor(client);
    },

    async setup(): Promise<void> {
      // Verify connectivity
      await health.check();
    },

    async teardown(): Promise<void> {
      // No cleanup needed - each test uses isolated tenants
    },
  };
};
