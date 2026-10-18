import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { AdminSessionService } from '../domain/admin-session-service.js';
import { createAdminSessionMiddleware } from '../application/admin-session-middleware.js';

const BodySchema = z.object({
  name: z.string().min(1).max(200),
});

export type OwnerlessWorkspaceFixtureDependencies = {
  adminSessionService: AdminSessionService;
  organizationStore: OrganizationStore;
};

/**
 * Test-only: create an ownerless workspace with no pending owner invite.
 * Registered only when YOINK_TEST_FIXTURES=true.
 */
export const registerOwnerlessWorkspaceFixtureRoutes = async (
  app: FastifyInstance,
  deps: OwnerlessWorkspaceFixtureDependencies
) => {
  await app.register(async (authedApp) => {
    authedApp.addHook(
      'preHandler',
      createAdminSessionMiddleware({ adminSessionService: deps.adminSessionService })
    );

    authedApp.post('/api/test/ownerless-workspace', async (request, reply) => {
      const parsed = BodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          message: 'Request validation failed',
          code: 'VALIDATION_FAILED',
        });
      }
      const organization = {
        id: crypto.randomUUID(),
        name: parsed.data.name,
        createdAt: new Date().toISOString(),
      };
      const saved = await deps.organizationStore.save(organization);
      if (saved.isErr()) {
        request.log.error({ error: saved.error.cause ?? saved.error }, 'Failed to create ownerless workspace');
        return reply.status(500).send({ message: 'Failed to create ownerless workspace' });
      }
      return reply.status(201).send({ organization });
    });
  });
};
