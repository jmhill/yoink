import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
// The handlers live on the public API edge. M5.7 removes this import.
// eslint-disable-next-line boundaries/element-types
import { createNoteHandlers, type NoteEdgeDependencies } from '../../edges/public-api/v1/notes.js';

export type NoteRoutesDependencies = NoteEdgeDependencies & {
  authMiddleware: AuthMiddleware;
};

type NoteHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export const registerNoteRoutes = async (app: FastifyInstance, deps: NoteRoutesDependencies) => {
  const { legacy } = createNoteHandlers(deps);

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    const mount = (method: NoteHttpMethod | NoteHttpMethod[], url: string) => {
      authedApp.route({
        method,
        url,
        handler: async (request, reply) => dispatchOrpc(legacy, request, reply),
      });
    };

    mount('GET', '/api/notes/changed');
    mount('POST', '/api/notes/import');
    mount(['GET', 'POST'], '/api/projects/:projectId/notes');
    mount(['GET', 'PATCH', 'DELETE'], '/api/projects/:projectId/notes/:noteId');
  });
};
