const TASK_FILTERS = new Set(['today', 'upcoming', 'mine', 'completed']);
const UUID_PILE = /^[0-9a-f-]{36}$/i;

export type TasksBoardCopy = {
  /** Smart-view / Unlisted heading. Null on a named pile — the name is not in the URL. */
  heading: string | null;
  empty: string;
};

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

/**
 * Place heading and empty-card copy for a settled Tasks URL.
 * Client-side rail moves must wait on this view's copy, not any leftover
 * empty string from the previous pile or smart view.
 */
export function tasksBoardCopyForUrl(url: string | URL): TasksBoardCopy | null {
  if (!isSettledTasksBoardUrl(url)) {
    return null;
  }
  const parsed = typeof url === 'string' ? new URL(url, 'http://localhost') : url;
  const filter = parsed.searchParams.get('filter');
  const pile = parsed.searchParams.get('pile');
  if (filter === 'today') {
    return { heading: 'Today', empty: 'No tasks for today' };
  }
  if (filter === 'upcoming') {
    return { heading: 'Upcoming', empty: 'No upcoming tasks' };
  }
  if (filter === 'mine') {
    return { heading: 'Mine', empty: 'No tasks assigned to you' };
  }
  if (filter === 'completed') {
    return { heading: 'Done', empty: 'No completed tasks' };
  }
  if (pile === 'unlisted') {
    return { heading: 'Unlisted', empty: 'No open unlisted tasks' };
  }
  return { heading: null, empty: 'No open tasks on this list' };
}
