import { describe, it, expect } from 'vitest';
import { compareOpenOrder, insertAtRememberedIndex, nextOpenOrder } from './open-order.js';

describe('nextOpenOrder', () => {
  it('is 0 when the pile is empty', () => {
    expect(nextOpenOrder([])).toBe(0);
  });

  it('appends after the highest existing open index, including gaps', () => {
    expect(nextOpenOrder([{ id: 'a', openOrder: 0 }, { id: 'c', openOrder: 2 }])).toBe(3);
  });
});

describe('insertAtRememberedIndex', () => {
  it('puts the task back at its remembered index among current open siblings', () => {
    const result = insertAtRememberedIndex(1, [
      { id: 'a', openOrder: 0, createdAt: '2025-01-15T10:00:00.000Z' },
      { id: 'c', openOrder: 2, createdAt: '2025-01-15T12:00:00.000Z' },
    ]);

    expect(result.openOrder).toBe(1);
    expect(result.siblingOrders).toEqual([
      { id: 'a', openOrder: 0 },
      { id: 'c', openOrder: 2 },
    ]);
  });

  it('clamps to the end when the open pile is now shorter', () => {
    const result = insertAtRememberedIndex(4, [
      { id: 'a', openOrder: 0, createdAt: '2025-01-15T10:00:00.000Z' },
    ]);

    expect(result.openOrder).toBe(1);
    expect(result.siblingOrders).toEqual([{ id: 'a', openOrder: 0 }]);
  });

  it('inserts at rank among current open tasks when later items were appended', () => {
    const result = insertAtRememberedIndex(1, [
      { id: 'd', openOrder: 3, createdAt: '2025-01-15T13:00:00.000Z' },
      { id: 'e', openOrder: 4, createdAt: '2025-01-15T14:00:00.000Z' },
    ]);

    expect(result.openOrder).toBe(1);
    expect(result.siblingOrders).toEqual([
      { id: 'd', openOrder: 0 },
      { id: 'e', openOrder: 2 },
    ]);
  });
});

describe('compareOpenOrder', () => {
  it('sorts missing indexes after assigned ones, then by createdAt', () => {
    const tasks = [
      { id: 'later', createdAt: '2025-01-15T12:00:00.000Z' },
      { id: 'earlier', createdAt: '2025-01-15T10:00:00.000Z' },
      { id: 'ordered', openOrder: 0, createdAt: '2025-01-15T11:00:00.000Z' },
    ];

    const sorted = [...tasks].sort(compareOpenOrder).map((task) => task.id);
    expect(sorted).toEqual(['ordered', 'earlier', 'later']);
  });
});
