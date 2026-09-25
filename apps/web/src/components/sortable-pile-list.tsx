import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type TouchEvent } from 'react';
import type { Task } from '@yoink/api-contracts';
import {
  draggedStridePx,
  dropIndexForClientY,
  insertionLineOffsetPx,
  neighborShiftPx,
  openTaskIds,
  openTaskOrderChanged,
  orderOpenTasksAfterDragMove,
} from '@/lib/open-task-order';
import { trySetPointerCapture } from '@/lib/safe-pointer-capture';
import { cn } from '@yoink/ui-base/lib/utils';

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

type SlotRect = {
  top: number;
  mid: number;
  height: number;
};

function slotRectsForOpenTasks(params: {
  root: HTMLElement | null;
  ids: readonly string[];
}): SlotRect[] {
  return params.ids.map((id) => {
    const node = params.root?.querySelector(`[data-sortable-item="${id}"]`);
    const box = node?.getBoundingClientRect();
    if (!box) {
      return { top: 0, mid: 0, height: 0 };
    }
    return {
      top: box.top,
      mid: box.top + box.height / 2,
      height: box.height,
    };
  });
}

/**
 * One-pile open-task list. Vertical drag (reorder mode) reorders.
 * One continuous gesture can cross any number of open slots; release
 * persists once. Neighbors slide apart and a primary-colored insertion
 * line marks the landing slot while the dragged row follows the pointer.
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
  const [fromIndex, setFromIndex] = useState(0);
  const [dropIndex, setDropIndex] = useState(0);
  const [draggedStride, setDraggedStride] = useState(0);
  const [insertionTop, setInsertionTop] = useState(0);
  const orderedIdsRef = useRef(orderedIds);
  const draggingIdRef = useRef<string | null>(null);
  const startYRef = useRef(0);
  const fromIndexRef = useRef(0);
  const slotMidsRef = useRef<number[]>([]);
  const slotTopsRef = useRef<number[]>([]);
  const listTopRef = useRef(0);
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

  const applyDropPreview = (clientY: number) => {
    const toIndex = dropIndexForClientY({
      clientY,
      mids: slotMidsRef.current,
    });
    pendingIdsRef.current = orderOpenTasksAfterDragMove({
      ids: orderedIdsRef.current,
      fromIndex: fromIndexRef.current,
      clientY,
      slotMids: slotMidsRef.current,
    });
    setDropIndex(toIndex);
    setInsertionTop(
      insertionLineOffsetPx({
        dropIndex: toIndex,
        slotTops: slotTopsRef.current,
        listTop: listTopRef.current,
      })
    );
  };

  const drag: PileDrag = {
    start: (taskId, clientY) => {
      if (disabled) {
        return;
      }
      const ids = orderedIdsRef.current;
      const origin = ids.indexOf(taskId);
      const rects = slotRectsForOpenTasks({
        root: listRef.current,
        ids,
      });
      draggingIdRef.current = taskId;
      startYRef.current = clientY;
      fromIndexRef.current = origin;
      slotMidsRef.current = rects.map((rect) => rect.mid);
      slotTopsRef.current = rects.map((rect) => rect.top);
      listTopRef.current = listRef.current?.getBoundingClientRect().top ?? 0;
      pendingIdsRef.current = ids;
      setDraggingId(taskId);
      setFromIndex(origin);
      setDropIndex(origin);
      setDraggedStride(
        draggedStridePx({
          fromIndex: origin,
          slotTops: slotTopsRef.current,
          slotHeights: rects.map((rect) => rect.height),
        })
      );
      setInsertionTop(
        insertionLineOffsetPx({
          dropIndex: origin,
          slotTops: slotTopsRef.current,
          listTop: listTopRef.current,
        })
      );
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
      applyDropPreview(clientY);
    },
    end: () => {
      const taskId = draggingIdRef.current;
      if (!taskId) {
        return;
      }
      draggingIdRef.current = null;
      setDraggingId(null);
      setOffsetY(0);
      setDraggedStride(0);
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
    <div ref={listRef} data-sortable-pile="" className="relative space-y-2">
      {orderedIds.map((id, index) => {
        const task = tasksById.get(id);
        if (!task) {
          return null;
        }
        const slotShiftY =
          draggingId === null
            ? 0
            : neighborShiftPx({
                index,
                fromIndex,
                dropIndex,
                draggedStride,
              });
        return (
          <SortablePileItem
            key={id}
            task={task}
            isDragging={draggingId === id}
            offsetY={offsetY}
            slotShiftY={slotShiftY}
            drag={drag}
            renderTask={renderTask}
          />
        );
      })}
      {draggingId !== null ? (
        <div
          data-insertion-line=""
          aria-hidden="true"
          className="pointer-events-none absolute right-3 left-3 z-30 h-1.5 rounded-full bg-primary"
          style={{ top: insertionTop }}
        />
      ) : null}
    </div>
  );
}

type SortablePileItemProps = {
  task: Task;
  isDragging: boolean;
  offsetY: number;
  slotShiftY: number;
  drag: PileDrag;
  renderTask: (task: Task, dragHandle: SortablePileDragHandle) => ReactNode;
};

function SortablePileItem({
  task,
  isDragging,
  offsetY,
  slotShiftY,
  drag,
  renderTask,
}: SortablePileItemProps) {
  const slotShift =
    slotShiftY < 0 ? 'up' : slotShiftY > 0 ? 'down' : undefined;

  return (
    <div
      data-sortable-item={task.id}
      data-dragging={isDragging ? '' : undefined}
      data-slot-shift={slotShift}
      className={cn(
        'relative',
        isDragging && 'z-20',
        !isDragging && 'transition-transform duration-150 ease-out'
      )}
      style={
        isDragging
          ? { transform: `translateY(${offsetY}px) scale(1.02)`, zIndex: 20 }
          : slotShiftY
            ? { transform: `translateY(${slotShiftY}px)` }
            : undefined
      }
    >
      <div
        className={
          isDragging ? 'rounded-xl shadow-lg ring-1 ring-border' : undefined
        }
      >
        {renderTask(task, {
          onPointerDown: (event) => {
            event.stopPropagation();
            trySetPointerCapture({
              target:
                event.currentTarget instanceof Element ? event.currentTarget : null,
              pointerId: event.pointerId,
            });
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
    </div>
  );
}
