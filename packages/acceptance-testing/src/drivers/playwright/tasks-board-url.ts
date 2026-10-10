const TASK_FILTERS = new Set(['today', 'upcoming', 'mine', 'completed']);
const UUID_PILE = /^[0-9a-f-]{36}$/i;

/**
 * Tasks board search after `beforeLoad` landing: a smart filter with no
 * pile, or a named/unlisted pile with no filter. Empty `/tasks` and
 * leftover `filter`+`pile` pairs are mid-redirect.
 */
export function isSettledTasksBoardUrl(url: string | URL): boolean {
  const parsed = typeof url === 'string' ? new URL(url, 'http://localhost') : url;
  if (parsed.pathname !== '/tasks') {
    return false;
  }
  const filter = parsed.searchParams.get('filter');
  const pile = parsed.searchParams.get('pile');
  if (filter && !pile) {
    return TASK_FILTERS.has(filter);
  }
  if (pile && !filter) {
    return pile === 'unlisted' || UUID_PILE.test(pile);
  }
  return false;
}

/**
 * The Inbox | Tasks thumb `Link to="/tasks"` has no search, so the board
 * lands on Today. From a named-list pile that is already `/tasks?pile=…`,
 * `waitForURL(/\/tasks/)` is already true and must not return before the
 * Today redirect finishes — that href change closes the mobile drawer.
 */
export function isTasksThumbLandingUrl(url: string | URL): boolean {
  const parsed = typeof url === 'string' ? new URL(url, 'http://localhost') : url;
  return (
    parsed.pathname === '/tasks' &&
    parsed.searchParams.get('filter') === 'today' &&
    !parsed.searchParams.get('pile')
  );
}
