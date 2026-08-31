import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { NamedList } from '@yoink/api-contracts';
import type { SaveNamedList } from '../application/ports.js';

const SeedBodySchema = z.object({
  name: z.string().min(1).max(200),
});

export type ListFixtureDependencies = {
  save: SaveNamedList;
  nextId: () => string;
  now: () => string;
  authMiddleware: AuthMiddleware;
};

/**
 * Test-only seed path. Not a product write API — not in listContract.
 * Registered only when AppConfig.testFixtures is true.
 */
export const registerListFixtureRoutes = async (
  app: FastifyInstance,
  deps: ListFixtureDependencies
) => {
  const { save, nextId, now, authMiddleware } = deps;

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    authedApp.post('/api/test/named-lists', async (request, reply) => {
      const parsed = SeedBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: 'Invalid named list seed' });
      }

      const list: NamedList = {
        id: nextId(),
        organizationId: request.authContext.organizationId,
        createdById: request.authContext.userId,
        name: parsed.data.name,
        createdAt: now(),
      };

      const result = await save(list);
      return result.match(
        () => reply.status(201).send(list),
        () => reply.status(500).send({ message: 'Internal server error' })
      );
    });
  });
};
