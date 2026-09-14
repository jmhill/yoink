import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Task } from '@yoink/api-contracts';
import { SortablePileList } from './sortable-pile-list';
import type { SortablePileDragHandle } from './sortable-pile-list';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const openTask = (title: string, openOrder: number): Task => ({
  id: uuid(openOrder + 1),
  organizationId: uuid(10),
  createdById: uuid(11),
  title,
  createdAt: '2026-01-01T00:00:00.000Z',
  openOrder,
});

const nativeSetPointerCapture = Element.prototype.setPointerCapture;

afterEach(() => {
  Element.prototype.setPointerCapture = nativeSetPointerCapture;
  vi.restoreAllMocks();
});

function stubSlotRects(root: HTMLElement) {
  const items = [...root.querySelectorAll<HTMLElement>('[data-sortable-item]')];
  items.forEach((item, index) => {
    vi.spyOn(item, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: index * 80,
      top: index * 80,
      left: 0,
      bottom: index * 80 + 80,
      right: 200,
      width: 200,
      height: 80,
      toJSON: () => ({}),
    });
  });
}

function renderPile(onPersistOrder = vi.fn()) {
  const tasks = [openTask('Milk', 0), openTask('Eggs', 1), openTask('Bread', 2)];
  const view = render(
    <SortablePileList
      tasks={tasks}
      onPersistOrder={onPersistOrder}
      renderTask={(task: Task, dragHandle: SortablePileDragHandle) => (
        <button type="button" aria-label={`Drag to reorder ${task.title}`} {...dragHandle}>
          {task.title}
        </button>
      )}
    />
  );
  const root = view.container.querySelector<HTMLElement>('[data-sortable-pile]');
  if (!root) {
    throw new Error('expected the sortable pile root');
  }
  stubSlotRects(root);
  return { ...view, onPersistOrder, tasks, root };
}

function dragHandle(title: string) {
  return screen.getByRole('button', { name: `Drag to reorder ${title}` });
}

/**
 * jsdom has no PointerEvent, so Testing Library's pointer helpers drop
 * clientY / buttons. Stamp them on a bubbling Event instead.
 */
function firePointer(
  node: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: { clientY: number; buttons: number; pointerId?: number }
) {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.assign(event, {
    pointerId: init.pointerId ?? 1,
    clientY: init.clientY,
    buttons: init.buttons,
    isPrimary: true,
    pointerType: 'mouse',
  });
  fireEvent(node, event);
}

function pointerDrag(params: { handle: HTMLElement; fromY: number; toY: number }) {
  firePointer(params.handle, 'pointerdown', { clientY: params.fromY, buttons: 1 });
  firePointer(params.handle, 'pointermove', { clientY: params.toY, buttons: 1 });
  firePointer(params.handle, 'pointerup', { clientY: params.toY, buttons: 0 });
}

describe('SortablePileList', () => {
  it('reorders across slots in one gesture and persists once', () => {
    const { onPersistOrder, tasks } = renderPile();

    pointerDrag({ handle: dragHandle('Milk'), fromY: 40, toY: 200 });

    expect(onPersistOrder).toHaveBeenCalledTimes(1);
    expect(onPersistOrder).toHaveBeenCalledWith([
      tasks[1]!.id,
      tasks[2]!.id,
      tasks[0]!.id,
    ]);
  });

  it('still reorders when setPointerCapture throws NotFoundError', () => {
    Element.prototype.setPointerCapture = function () {
      throw new DOMException(
        "Failed to execute 'setPointerCapture' on 'Element': No active pointer with the given id is found.",
        'NotFoundError'
      );
    };
    const { onPersistOrder, tasks } = renderPile();

    expect(() =>
      pointerDrag({ handle: dragHandle('Bread'), fromY: 200, toY: 40 })
    ).not.toThrow();

    expect(onPersistOrder).toHaveBeenCalledTimes(1);
    expect(onPersistOrder).toHaveBeenCalledWith([
      tasks[2]!.id,
      tasks[0]!.id,
      tasks[1]!.id,
    ]);
  });
});
