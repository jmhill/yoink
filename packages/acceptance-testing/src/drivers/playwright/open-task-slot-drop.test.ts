import { describe, expect, it } from 'vitest';
import { dropPointForOpenTaskSlot } from './open-task-slot-drop.js';

const slot = (y: number) => ({ x: 0, y, width: 200, height: 80 });

describe('dropPointForOpenTaskSlot', () => {
  it('lands just past the next slot mid when dragging down', () => {
    const from = slot(0);
    const to = slot(80);
    expect(dropPointForOpenTaskSlot(from, to)).toEqual({ x: 100, y: 121 });
  });

  it('lands on the target slot mid when dragging up', () => {
    const from = slot(80);
    const to = slot(0);
    expect(dropPointForOpenTaskSlot(from, to)).toEqual({ x: 100, y: 40 });
  });

  it('is at or past the mid a title-line Y would miss', () => {
    const to = slot(80);
    const titleLineY = to.y + 12;
    const drop = dropPointForOpenTaskSlot(slot(0), to);
    expect(titleLineY).toBeLessThan(to.y + to.height / 2);
    expect(drop.y).toBeGreaterThanOrEqual(to.y + to.height / 2);
  });
});
