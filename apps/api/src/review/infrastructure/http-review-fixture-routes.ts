import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { Database } from '../../database/types.js';

const BackdateBodySchema = z.object({
  projectId: z.string().uuid(),
  occurredAt: z.string().datetime(),
});

const FinishTaskBodySchema = z.object({
  taskId: z.string().uuid(),
  completedAt: z.string().datetime(),
});

export type ReviewFixtureRoutesDependencies = {
  authMiddleware: AuthMiddleware;
  db: Database;
};

/**
 * Clock-injected e2e fixture. Registered only when YOINK_TEST_FIXTURES=true.
 * Backdates created_at, last_changed_at, and every change_log row for the
 * caller's project so Review can seed a quiet row without sleeping.
 */
export const registerReviewFixtureRoutes = async (
  app: FastifyInstance,
  deps: ReviewFixtureRoutesDependencies
) => {
  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    authedApp.post('/api/test/review-fixture/backdate', async (request, reply) => {
      const parsed = BackdateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          message: 'Request validation failed',
          code: 'VALIDATION_FAILED',
        });
      }
      const organizationId = request.authContext.organizationId;
      const updated = await deps.db.execute({
        sql: `
          UPDATE projects
          SET created_at = ?, last_changed_at = ?
          WHERE id = ? AND organization_id = ?
        `,
        args: [
          parsed.data.occurredAt,
          parsed.data.occurredAt,
          parsed.data.projectId,
          organizationId,
        ],
      });
      if (updated.rowsAffected === 0) {
        return reply.status(404).send({ message: 'Project not found' });
      }
      await deps.db.execute({
        sql: `
          UPDATE change_log
          SET occurred_at = ?
          WHERE project_id = ? AND organization_id = ?
        `,
        args: [parsed.data.occurredAt, parsed.data.projectId, organizationId],
      });
      return reply.status(204).send();
    });

    authedApp.post('/api/test/review-fixture/finish-task', async (request, reply) => {
      const parsed = FinishTaskBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          message: 'Request validation failed',
          code: 'VALIDATION_FAILED',
        });
      }
      const organizationId = request.authContext.organizationId;
      const completedBy = request.authContext.userId;
      const updated = await deps.db.execute({
        sql: `
          UPDATE tasks
          SET completed_at = ?, completed_by = ?
          WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
        `,
        args: [parsed.data.completedAt, completedBy, parsed.data.taskId, organizationId],
      });
      if (updated.rowsAffected === 0) {
        return reply.status(404).send({ message: 'Task not found' });
      }
      return reply.status(204).send();
    });
  });
};
