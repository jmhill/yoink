import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { AdminSessionService } from '../domain/admin-session-service.js';
import { createAdminSessionMiddleware } from '../application/admin-session-middleware.js';

const OwnerlessBodySchema = z.object({
  name: z.string().min(1).max(200),
});

const ExpireInvitationBodySchema = z.object({
  code: z.string().min(8).max(12),
});

const AssignOwnerKeepingInviteBodySchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type OwnerlessWorkspaceFixtureDependencies = {
  adminSessionService: AdminSessionService;
  organizationStore: OrganizationStore;
  invitationStore: InvitationStore;
  membershipStore: OrganizationMembershipStore;
};

/**
 * Test-only fixtures for owner-invite E2E.
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
      const parsed = OwnerlessBodySchema.safeParse(request.body);
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

    authedApp.post('/api/test/expire-invitation', async (request, reply) => {
      const parsed = ExpireInvitationBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          message: 'Request validation failed',
          code: 'VALIDATION_FAILED',
        });
      }
      const found = await deps.invitationStore.findByCode(parsed.data.code);
      if (found.isErr()) {
        request.log.error({ error: found.error.cause ?? found.error }, 'Failed to expire invitation');
        return reply.status(500).send({ message: 'Failed to expire invitation' });
      }
      if (!found.value) {
        return reply.status(404).send({ message: 'Invitation not found' });
      }
      const expired = await deps.invitationStore.save({
        ...found.value,
        expiresAt: '2020-01-01T00:00:00.000Z',
      });
      if (expired.isErr()) {
        request.log.error({ error: expired.error.cause ?? expired.error }, 'Failed to expire invitation');
        return reply.status(500).send({ message: 'Failed to expire invitation' });
      }
      return reply.status(204).send();
    });

    authedApp.post('/api/test/assign-owner-keeping-invite', async (request, reply) => {
      const parsed = AssignOwnerKeepingInviteBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          message: 'Request validation failed',
          code: 'VALIDATION_FAILED',
        });
      }
      const saved = await deps.membershipStore.save({
        id: crypto.randomUUID(),
        userId: parsed.data.userId,
        organizationId: parsed.data.organizationId,
        role: 'owner',
        isPersonalOrg: false,
        joinedAt: new Date().toISOString(),
      });
      if (saved.isErr()) {
        request.log.error(
          { error: saved.error.cause ?? saved.error },
          'Failed to assign owner keeping invite'
        );
        return reply.status(500).send({ message: 'Failed to assign owner keeping invite' });
      }
      return reply.status(204).send();
    });
  });
};
