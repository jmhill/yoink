/**
 * Project status on the web edge or the alias.
 * `/web-api/projects/:id/status` does not contain `/api/projects/`.
 */
export const isProjectStatusUrl = (url: string): boolean => {
  const path = requestPathname(url);
  return (
    (path.startsWith('/api/projects/') || path.startsWith('/web-api/projects/')) &&
    path.endsWith('/status')
  );
};

/**
 * One project, not its tasks, history, notes, or status.
 * Create stays on the collection path.
 */
export const isProjectItemUrl = (url: string): boolean => {
  const path = requestPathname(url);
  return /^\/api\/projects\/[^/]+$/.test(path) || /^\/web-api\/projects\/[^/]+$/.test(path);
};

/**
 * Project-page and staged-import calls that must leave the alias.
 * The shared catalog stays. Project notes on this page are the notes screen.
 */
export const isOwnedProjectAliasUrl = (url: string): boolean => {
  const path = requestPathname(url);
  const search = (() => {
    try {
      return new URL(url).search;
    } catch {
      return '';
    }
  })();
  if (path === '/api/projects/imports' || path.startsWith('/api/projects/imports/')) {
    return true;
  }
  const match = /^\/api\/projects\/([^/]+)(?:\/(.*))?$/.exec(path);
  if (match === null) {
    return false;
  }
  const rest = match[2] ?? '';
  if (rest === '') {
    return true;
  }
  if (rest === 'tasks') {
    return !search.includes('finished');
  }
  if (rest === 'notes' || rest.startsWith('notes/')) {
    return true;
  }
  return (
    rest === 'status' ||
    rest === 'next-action' ||
    rest === 'confirm' ||
    rest === 'decline' ||
    rest === 'restore'
  );
};

/** Pathname of a browser request. Query strings stay off the comparison. */
export const requestPathname = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};

/**
 * Task collection on the web edge or the alias.
 * `/web-api/tasks` does not contain the substring `/api/tasks`.
 */
export const isTaskCollectionUrl = (url: string): boolean => {
  const path = requestPathname(url);
  return path === '/api/tasks' || path === '/web-api/tasks';
};

/** One task on the web edge or the alias (`/tasks/:id`, complete, history). */
export const isTaskItemUrl = (url: string): boolean => {
  const path = requestPathname(url);
  return path.startsWith('/api/tasks/') || path.startsWith('/web-api/tasks/');
};

/**
 * One project note on the web edge or the alias.
 * Import and changed stay `/api/notes` and do not match.
 */
export const isProjectNoteItemUrl = (url: string): boolean => {
  const path = requestPathname(url);
  return /^\/(?:api|web-api)\/projects\/[^/]+\/notes\/[^/]+$/.test(path);
};

/** Named-list collection on the web edge or the alias. */
export const isNamedListCollectionUrl = (url: string): boolean => {
  const path = requestPathname(url);
  return path === '/api/lists' || path === '/web-api/lists';
};

/**
 * One named list. With an id, only that list's own path, not its open tasks.
 */
export const isNamedListItemUrl = (url: string, listId?: string): boolean => {
  const path = requestPathname(url);
  if (listId !== undefined) {
    return path === `/api/lists/${listId}` || path === `/web-api/lists/${listId}`;
  }
  return path.startsWith('/api/lists/') || path.startsWith('/web-api/lists/');
};

/**
 * Live task and list reads. The tasks board and the shared list client use
 * `/web-api`. Project, work, and review still read tasks on `/api`.
 */
export const isLiveTaskOrListGet = (url: string): boolean => {
  const path = requestPathname(url);
  return (
    path === '/api/tasks' ||
    path.startsWith('/api/tasks/') ||
    path === '/web-api/tasks' ||
    path.startsWith('/web-api/tasks/') ||
    path === '/api/lists' ||
    path.startsWith('/api/lists/') ||
    path === '/web-api/lists' ||
    path.startsWith('/web-api/lists/') ||
    path === '/api/unlisted/tasks' ||
    path.startsWith('/api/unlisted/') ||
    path === '/web-api/unlisted/tasks' ||
    path.startsWith('/web-api/unlisted/')
  );
};
