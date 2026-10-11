export type SnoozeUntilOption = 'later-today' | 'tomorrow' | 'next-week';

export type PromoteTaskInput = {
  title: string;
  dueDate?: string;
  listId?: string;
  projectId?: string;
};

export type PromoteTaskData = {
  title: string;
  dueDate?: string;
  listId?: string;
  projectId?: string;
};

export type InboxQueryPage<TCapture extends { id: string } = { id: string }> = {
  status: number;
  body: {
    captures: readonly TCapture[];
    total: number;
  };
};

const localAt = (now: Date, dayOffset: number, hours: number): Date =>
  new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + dayOffset,
    hours,
    0,
    0,
    0
  );

export function snoozeUntil(option: SnoozeUntilOption, now: Date): string {
  switch (option) {
    case 'later-today':
      if (now.getHours() >= 16) {
        return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
      }
      return localAt(now, 0, 18).toISOString();
    case 'tomorrow':
      return localAt(now, 1, 9).toISOString();
    case 'next-week': {
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      return localAt(now, daysUntilMonday, 9).toISOString();
    }
  }
}

export function promoteTaskData(input: PromoteTaskInput): PromoteTaskData {
  return {
    title: input.title,
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(input.listId ? { listId: input.listId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
  };
}

export function inboxQueryWithoutCapture<
  TCapture extends { id: string },
  TInbox extends InboxQueryPage<TCapture>,
>(inbox: TInbox, id: string): TInbox {
  return {
    ...inbox,
    body: {
      ...inbox.body,
      captures: inbox.body.captures.filter((capture) => capture.id !== id),
      total: Math.max(0, inbox.body.total - 1),
    },
  };
}
