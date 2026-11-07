import type { PublicApiRoute } from './mount.js';

/** Same order as today's registrars, so a static segment is not captured by `:id`. */
export const captureRoutes = [
  { method: ['GET', 'POST'], path: '/captures' },
  { method: 'POST', path: '/captures/trash/empty' },
  { method: ['GET', 'PATCH', 'DELETE'], path: '/captures/:id' },
  { method: 'POST', path: '/captures/:id/trash' },
  { method: 'POST', path: '/captures/:id/restore' },
  { method: 'POST', path: '/captures/:id/snooze' },
  { method: 'POST', path: '/captures/:id/unsnooze' },
  { method: 'POST', path: '/captures/:id/process' },
] as const satisfies readonly PublicApiRoute[];

export const processToProjectRoutes = [
  { method: 'POST', path: '/captures/:id/process-to-project' },
] as const satisfies readonly PublicApiRoute[];

export const taskRoutes = [
  { method: ['GET', 'POST'], path: '/tasks' },
  { method: 'POST', path: '/tasks/:id/complete' },
  { method: 'POST', path: '/tasks/:id/uncomplete' },
  { method: 'POST', path: '/tasks/:id/pin' },
  { method: 'POST', path: '/tasks/:id/unpin' },
  { method: 'GET', path: '/tasks/:id/history' },
  { method: ['GET', 'PATCH', 'DELETE'], path: '/tasks/:id' },
] as const satisfies readonly PublicApiRoute[];

export const listRoutes = [
  { method: ['GET', 'POST'], path: '/lists' },
  { method: 'GET', path: '/unlisted/tasks' },
  { method: 'PUT', path: '/unlisted/tasks/order' },
  { method: 'GET', path: '/lists/:id/tasks' },
  { method: 'PUT', path: '/lists/:id/tasks/order' },
  { method: ['PATCH', 'DELETE'], path: '/lists/:id' },
] as const satisfies readonly PublicApiRoute[];

export const projectRoutes = [
  { method: ['GET', 'POST'], path: '/projects' },
  { method: ['GET', 'POST'], path: '/projects/imports' },
  { method: 'GET', path: '/projects/imports/:id' },
  { method: 'POST', path: '/projects/imports/:id/apply' },
  { method: 'POST', path: '/projects/imports/:id/discard' },
  { method: ['GET', 'PATCH'], path: '/projects/:id' },
  { method: 'GET', path: '/projects/:id/tasks' },
  { method: 'GET', path: '/projects/:id/history' },
  { method: 'PUT', path: '/projects/:id/status' },
  { method: 'POST', path: '/projects/:id/confirm' },
  { method: 'POST', path: '/projects/:id/decline' },
  { method: 'POST', path: '/projects/:id/restore' },
  { method: 'PUT', path: '/projects/:id/next-action' },
] as const satisfies readonly PublicApiRoute[];

export const noteRoutes = [
  { method: 'GET', path: '/notes/changed' },
  { method: 'POST', path: '/notes/import' },
  { method: ['GET', 'POST'], path: '/projects/:projectId/notes' },
  { method: ['GET', 'PATCH', 'DELETE'], path: '/projects/:projectId/notes/:noteId' },
] as const satisfies readonly PublicApiRoute[];

export const workRoutes = [
  { method: 'GET', path: '/work/next-actions' },
  { method: 'GET', path: '/work/due' },
  { method: 'GET', path: '/work/lists' },
] as const satisfies readonly PublicApiRoute[];

export const reviewRoutes = [
  { method: 'GET', path: '/review/done' },
  { method: 'GET', path: '/review' },
] as const satisfies readonly PublicApiRoute[];

/** Frozen `tokens.list` only. Create and delete stay client-only. */
export const tokenListRoutes = [
  { method: 'GET', path: '/auth/tokens' },
] as const satisfies readonly PublicApiRoute[];

export const publicApiV1Routes = [
  ...captureRoutes,
  ...processToProjectRoutes,
  ...taskRoutes,
  ...listRoutes,
  ...projectRoutes,
  ...noteRoutes,
  ...workRoutes,
  ...reviewRoutes,
  ...tokenListRoutes,
] as const satisfies readonly PublicApiRoute[];
