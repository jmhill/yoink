import type { FastifyInstance } from 'fastify';
import { createCaptureHandlers, type CaptureEdgeDependencies } from './captures.js';
import { createListHandlers, type ListEdgeDependencies } from './lists.js';
import type { PublicApiAuth } from './log-context.js';
import { mountPublicApiRoutes } from './mount.js';
import { createNoteHandlers, type NoteEdgeDependencies } from './notes.js';
import { createProjectHandlers, type ProjectEdgeDependencies } from './projects.js';
import { createReviewHandlers, type ReviewEdgeDependencies } from './review.js';
import {
  captureRoutes,
  listRoutes,
  noteRoutes,
  processToProjectRoutes,
  projectRoutes,
  reviewRoutes,
  taskRoutes,
  workRoutes,
} from './routes.js';
import { createTaskHandlers, type TaskEdgeDependencies } from './tasks.js';
import { createWorkHandlers, type WorkEdgeDependencies } from './work.js';

export type PublicApiV1Dependencies = CaptureEdgeDependencies &
  ListEdgeDependencies &
  NoteEdgeDependencies &
  ProjectEdgeDependencies &
  ReviewEdgeDependencies &
  TaskEdgeDependencies &
  WorkEdgeDependencies & {
    tokenAuth: PublicApiAuth;
    aliasAuth: PublicApiAuth;
  };

/**
 * Mounts the frozen integration procedures except `tokens.list`.
 * Token routes stay on their current registrar: the alias would otherwise
 * collide with `GET /api/auth/tokens`, and M3.2 does not move token routes.
 * Health is not on this router.
 *
 * Not called from `app.ts` yet. Calling it beside the legacy registrars
 * would register `/api/...` twice.
 */
export const registerPublicApiV1 = async (app: FastifyInstance, deps: PublicApiV1Dependencies): Promise<void> => {
  const auth = { tokenAuth: deps.tokenAuth, aliasAuth: deps.aliasAuth };
  const captures = createCaptureHandlers(deps);
  const tasks = createTaskHandlers(deps);
  const lists = createListHandlers(deps);
  const projects = createProjectHandlers(deps);
  const notes = createNoteHandlers(deps);
  const work = createWorkHandlers(deps);
  const review = createReviewHandlers(deps);

  mountPublicApiRoutes(app, { ...auth, handler: captures.v1Captures, routes: captureRoutes });
  mountPublicApiRoutes(app, { ...auth, handler: captures.v1Project, routes: processToProjectRoutes });
  mountPublicApiRoutes(app, { ...auth, handler: tasks.v1, routes: taskRoutes });
  mountPublicApiRoutes(app, { ...auth, handler: lists.v1, routes: listRoutes });
  mountPublicApiRoutes(app, { ...auth, handler: projects.v1, routes: projectRoutes });
  mountPublicApiRoutes(app, { ...auth, handler: notes.v1, routes: noteRoutes });
  mountPublicApiRoutes(app, { ...auth, handler: work.v1, routes: workRoutes });
  mountPublicApiRoutes(app, { ...auth, handler: review.v1, routes: reviewRoutes });
};
