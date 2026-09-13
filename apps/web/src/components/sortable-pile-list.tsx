import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type TouchEvent } from 'react';
import type { Task } from '@yoink/api-contracts';
import {
  openTaskIds,
  openTaskOrderChanged,
  orderOpenTasksAfterDragMove,
} from '@/lib/open-task-order';

export type SortablePileDragHandle = {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onTouchStart: (event: TouchEvent) => void;
  onTouchMove: (event: TouchEvent) => void;
  onTouchEnd: (event: TouchEvent) => void;
};

type SortablePileListProps = {
  tasks: Task[];
  disabled?: boolean;
  onPersistOrder: (taskIds: string[]) => void;
  renderTask: (task: Task, dragHandle: SortablePileDragHandle) => ReactNode;
};

type PileDrag = {
  start: (taskId: string, clientY: number) => void;
  move: (clientY: number) => void;
  end: () => void;
};

function slotMidsForOpenTasks(params: {
  root: HTMLElement | null;
  ids: readonly string[];
}): number[] {
  return params.ids.map((id) => {
    const node = params.root?.querySelector(`[data-sortable-item="${id}"]`);
    const box = node?.getBoundingClientRect();
    return box ? box.top + box.height / 2 : 0;
  });
}

/**
 * One-pile open-task list. Vertical drag on the grip handle reorders.
 * One continuous gesture can cross any number of open slots; release
 * persists once. The row body keeps horizontal swipe-to-complete.
 * Smart views do not use this.
 */
export function SortablePileList({
  tasks,
  disabled = false,
  onPersistOrder,
  renderTask,
}: SortablePileListProps) {
  const [orderedIds, setOrderedIds] = useState(() => openTaskIds(tasks));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [offsetY, setOffsetY] = useState(0);
  const orderedIdsRef = useRef(orderedIds);
  const draggingIdRef = useRef<string | null>(null);
  const startYRef = useRef(0);
  const fromIndexRef = useRef(0);
  const slotMidsRef = useRef<number[]>([]);
  const pendingIdsRef = useRef<string[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (draggingIdRef.current) {
      return;
    }
    const next = openTaskIds(tasks);
    orderedIdsRef.current = next;
    setOrderedIds(next);
  }, [tasks]);

  const drag: PileDrag = {
    start: (taskId, clientY) => {
      if (disabled) {
        return;
      }
      const ids = orderedIdsRef.current;
      draggingIdRef.current = taskId;
      startYRef.current = clientY;
      fromIndexRef.current = ids.indexOf(taskId);
      slotMidsRef.current = slotMidsForOpenTasks({
        root: listRef.current,
        ids,
      });
      pendingIdsRef.current = ids;
      setDraggingId(taskId);
      setOffsetY(0);
    },
    move: (clientY) => {
      const taskId = draggingIdRef.current;
      if (!taskId) {
        return;
      }
      // Keep the original grab origin for the whole gesture so the card
      // follows the pointer across every slot — do not reset after a swap.
      setOffsetY(clientY - startYRef.current);
      pendingIdsRef.current = orderOpenTasksAfterDragMove({
        ids: orderedIdsRef.current,
        fromIndex: fromIndexRef.current,
        clientY,
        slotMids: slotMidsRef.current,
      });
    },
    end: () => {
      const taskId = draggingIdRef.current;
      if (!taskId) {
        return;
      }
      draggingIdRef.current = null;
      setDraggingId(null);
      setOffsetY(0);
      const next = pendingIdsRef.current ?? orderedIdsRef.current;
      pendingIdsRef.current = null;
      orderedIdsRef.current = next;
      setOrderedIds(next);
      if (openTaskOrderChanged(openTaskIds(tasks), next)) {
        onPersistOrder(next);
      }
    },
  };

  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <div ref={listRef} data-sortable-pile="" className="space-y-2">
      {orderedIds.map((id) => {
        const task = tasksById.get(id);
        if (!task) {
          return null;
        }
        return (
          <SortablePileItem
            key={id}
            task={task}
            isDragging={draggingId === id}
            offsetY={offsetY}
            drag={drag}
            renderTask={renderTask}
          />
        );
      })}
    </div>
  );
}

type SortablePileItemProps = {
  task: Task;
  isDragging: boolean;
  offsetY: number;
  drag: PileDrag;
  renderTask: (task: Task, dragHandle: SortablePileDragHandle) => ReactNode;
};

function SortablePileItem({
  task,
  isDragging,
  offsetY,
  drag,
  renderTask,
}: SortablePileItemProps) {
  return (
    <div
      data-sortable-item={task.id}
      className="relative"
      style={
        isDragging ? { transform: `translateY(${offsetY}px)`, zIndex: 10 } : undefined
      }
    >
      {renderTask(task, {
        onPointerDown: (event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.start(task.id, event.clientY);
        },
          onPointerMove: (event) => {
            event.stopPropagation();
            if (event.buttons === 0) {
              drag.end();
              return;
            }
            drag.move(event.clientY);
          },
        onPointerUp: (event) => {
          event.stopPropagation();
          drag.end();
        },
        onTouchStart: (event) => {
          event.stopPropagation();
          const touch = event.touches[0];
          if (!touch) {
            return;
          }
          drag.start(task.id, touch.clientY);
        },
        onTouchMove: (event) => {
          event.preventDefault();
          event.stopPropagation();
          const touch = event.touches[0];
          if (!touch) {
            return;
          }
          drag.move(touch.clientY);
        },
        onTouchEnd: (event) => {
          event.stopPropagation();
          drag.end();
        },
      })}
    </div>
  );
}
