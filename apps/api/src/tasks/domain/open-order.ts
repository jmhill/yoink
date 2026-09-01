export type OrderedTask = {
  id: string;
  openOrder?: number;
  createdAt?: string;
};

export const compareOpenOrder = (left: OrderedTask, right: OrderedTask): number => {
  const leftOrder = left.openOrder ?? Number.POSITIVE_INFINITY;
  const rightOrder = right.openOrder ?? Number.POSITIVE_INFINITY;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return (left.createdAt ?? '').localeCompare(right.createdAt ?? '');
};

export const nextOpenOrder = (openTasks: OrderedTask[]): number => {
  if (openTasks.length === 0) {
    return 0;
  }
  return Math.max(...openTasks.map((task) => task.openOrder ?? -1)) + 1;
};

export const insertAtRememberedIndex = (
  remembered: number | undefined,
  openSiblings: OrderedTask[]
): { openOrder: number; siblingOrders: { id: string; openOrder: number }[] } => {
  const sorted = [...openSiblings].sort(compareOpenOrder);
  const target = Math.min(remembered ?? 0, sorted.length);
  const siblingOrders = [
    ...sorted.slice(0, target),
    ...sorted.slice(target),
  ].map((task, index) => ({
    id: task.id,
    openOrder: index < target ? index : index + 1,
  }));

  return { openOrder: target, siblingOrders };
};
