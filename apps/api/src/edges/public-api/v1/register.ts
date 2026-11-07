import type { FastifyInstance } from 'fastify';
import { aliasRetirementHttpDates, type AliasRetirementWindow } from './alias-headers.js';
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
  tokenListRoutes,
  workRoutes,
} from './routes.js';
import { createTaskHandlers, type TaskEdgeDependencies } from './tasks.js';
import { createTokenListHandlers, type TokenListEdgeDependencies } from './tokens.js';
import { createWorkHandlers, type WorkEdgeDependencies } from './work.js';

export type PublicApiV1Dependencies = CaptureEdgeDependencies &
  ListEdgeDependencies &
  NoteEdgeDependencies &
  ProjectEdgeDependencies &
  ReviewEdgeDependencies &
  TaskEdgeDependencies &
  WorkEdgeDependencies & {
    /** Present when signup is configured, which is when token routes exist today. */
    tokenHandlers?: TokenListEdgeDependencies['tokenHandlers'];
    tokenAuth: PublicApiAuth;
    aliasAuth: PublicApiAuth;
    /**
     * Omit in production until M7.1 records a real window. When set, the span
     * must be at least 90 days and the alias adds `Deprecation` and `Sunset`.
     */
    aliasRetirement?: AliasRetirementWindow;
  };

/**
 * Mounts the frozen integration procedures at token-only `/api/v1` and at the
 * `/api` alias. `GET /auth/tokens` is included when `tokenHandlers` is set.
 * Token create, delete, mint, and reissue are not on this router.
 * Health is not on this router. `aliasRetirement` stays unset until M7.1.
 */
export const registerPublicApiV1 = async (app: FastifyInstance, deps: PublicApiV1Dependencies): Promise<void> => {
  if (deps.aliasRetirement !== undefined) aliasRetirementHttpDates(deps.aliasRetirement);
  const auth = {
    tokenAuth: deps.tokenAuth,
    aliasAuth: deps.aliasAuth,
    aliasRetirement: deps.aliasRetirement,
  };
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
  if (deps.tokenHandlers !== undefined) {
    const tokens = createTokenListHandlers({ tokenHandlers: deps.tokenHandlers });
    mountPublicApiRoutes(app, { ...auth, handler: tokens.v1, routes: tokenListRoutes });
  }
};
