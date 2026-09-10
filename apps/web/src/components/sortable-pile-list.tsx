import { Reorder, useDragControls } from 'framer-motion';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { Task } from '@yoink/api-contracts';
import { openTaskIds, openTaskOrderChanged } from '@/lib/open-task-order';

export type SortablePileDragHandle = {
  onPointerDown: (event: PointerEvent) => void;
};

type SortablePileListProps = {
  tasks: Task[];
  disabled?: boolean;
  onPersistOrder: (taskIds: string[]) => void;
  renderTask: (task: Task, dragHandle: SortablePileDragHandle) => ReactNode;
};

/**
 * One-pile open-task list. Vertical drag (grip handle) reorders; the row
 * body keeps horizontal swipe-to-complete. Smart views do not use this.
 */
export function SortablePileList({
  tasks,
  disabled = false,
  onPersistOrder,
  renderTask,
}: SortablePileListProps) {
  const [orderedIds, setOrderedIds] = useState(() => openTaskIds(tasks));
  const orderedIdsRef = useRef(orderedIds);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (draggingRef.current) {
      return;
    }
    const next = openTaskIds(tasks);
    orderedIdsRef.current = next;
    setOrderedIds(next);
  }, [tasks]);

  const handleReorder = (next: string[]) => {
    orderedIdsRef.current = next;
    setOrderedIds(next);
  };

  const persistIfChanged = () => {
    draggingRef.current = false;
    const next = orderedIdsRef.current;
    if (openTaskOrderChanged(openTaskIds(tasks), next)) {
      onPersistOrder(next);
    }
  };

  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <Reorder.Group
      as="div"
      axis="y"
      values={orderedIds}
      onReorder={handleReorder}
      data-sortable-pile=""
      className="space-y-2"
    >
      {orderedIds.map((id) => {
        const task = tasksById.get(id);
        if (!task) {
          return null;
        }
        return (
          <SortablePileItem
            key={id}
            taskId={id}
            disabled={disabled}
            onDragStart={() => {
              draggingRef.current = true;
            }}
            onDragEnd={persistIfChanged}
          >
            {(dragHandle) => renderTask(task, dragHandle)}
          </SortablePileItem>
        );
      })}
    </Reorder.Group>
  );
}

type SortablePileItemProps = {
  taskId: string;
  disabled: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  children: (dragHandle: SortablePileDragHandle) => ReactNode;
};

function SortablePileItem({
  taskId,
  disabled,
  onDragStart,
  onDragEnd,
  children,
}: SortablePileItemProps) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      as="div"
      value={taskId}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="relative"
    >
      {children({
        onPointerDown: (event) => {
          if (disabled) {
            return;
          }
          event.stopPropagation();
          controls.start(event);
        },
      })}
    </Reorder.Item>
  );
}
