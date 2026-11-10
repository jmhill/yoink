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
