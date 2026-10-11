export type ProcessKeyAction =
  | 'make-task'
  | 'new-project'
  | 'someday-project'
  | 'snooze'
  | 'trash';

export const PROCESS_KEY_HINTS: Record<ProcessKeyAction, string> = {
  'make-task': 'T',
  'new-project': 'P',
  'someday-project': 'S',
  snooze: 'Z',
  trash: '⌫',
};

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function shouldListenForProcessKeys(input: {
  desktop: boolean;
  hasCurrent: boolean;
  sheetOpen: boolean;
  actionPending: boolean;
  pathname: string;
}): boolean {
  return (
    input.desktop &&
    input.hasCurrent &&
    !input.sheetOpen &&
    !input.actionPending &&
    input.pathname === '/process'
  );
}

export function shouldReleaseProcessKeyLock(input: {
  actionPending: boolean;
  lockedId: string | null;
  currentId: string | null;
}): boolean {
  return !input.actionPending && input.lockedId !== null && input.currentId !== input.lockedId;
}

export function processKeyAction(event: KeyboardEvent): ProcessKeyAction | null {
  if (event.repeat) {
    return null;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return null;
  }
  if (isTypingTarget(event.target)) {
    return null;
  }
  switch (event.key) {
    case 't':
    case 'T':
      return 'make-task';
    case 'p':
    case 'P':
      return 'new-project';
    case 's':
    case 'S':
      return 'someday-project';
    case 'z':
    case 'Z':
      return 'snooze';
    case 'Delete':
    case 'Backspace':
      return 'trash';
    default:
      return null;
  }
}
