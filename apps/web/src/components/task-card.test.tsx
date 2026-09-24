import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Task } from '@yoink/api-contracts';
import type { SortablePileDragHandle } from '@/components/sortable-pile-list';
import { TaskCard } from './task-card';

const milk: Task = {
  id: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000010',
  createdById: '00000000-0000-4000-8000-000000000011',
  title: 'Milk',
  createdAt: '2026-01-01T00:00:00.000Z',
  pinnedAt: '2026-01-02T00:00:00.000Z',
};

const inertHandle: SortablePileDragHandle = {
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  onTouchStart: vi.fn(),
  onTouchMove: vi.fn(),
  onTouchEnd: vi.fn(),
};

describe('TaskCard', () => {
  it('shows only the complete circle and title — no ⋯, pencil, trash, or grip', () => {
    render(
      <TaskCard
        task={milk}
        onComplete={vi.fn()}
        onUncomplete={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Mark task "Milk" as complete' })).toBeTruthy();
    expect(screen.getByText('Milk')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^(Pin|Unpin) task/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More actions for task "Milk"' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit task "Milk"' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete task "Milk"' })).toBeNull();
    expect(screen.queryByLabelText('Drag to reorder Milk')).toBeNull();
    expect(document.querySelector('[data-drag-handle]')).toBeNull();
  });

  it('opens edit when tapping the title or empty row space, not the circle', () => {
    const onEdit = vi.fn();
    const onComplete = vi.fn();
    render(
      <TaskCard
        task={milk}
        onComplete={onComplete}
        onUncomplete={vi.fn()}
        onEdit={onEdit}
      />
    );

    fireEvent.click(screen.getByText('Milk'));
    expect(onEdit).toHaveBeenCalledWith(milk);
    expect(onComplete).not.toHaveBeenCalled();

    onEdit.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Mark task "Milk" as complete' }));
    expect(onComplete).toHaveBeenCalledWith(milk.id);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('shows a grip in reorder mode and does not edit, complete, or swipe', () => {
    const onEdit = vi.fn();
    const onComplete = vi.fn();
    render(
      <TaskCard
        task={milk}
        onComplete={onComplete}
        onUncomplete={vi.fn()}
        onEdit={onEdit}
        dragHandle={inertHandle}
        reorderMode
      />
    );

    expect(document.querySelector('[data-drag-handle]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'More actions for task "Milk"' })).toBeNull();

    fireEvent.click(screen.getByText('Milk'));
    expect(onEdit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Mark task "Milk" as complete' }));
    expect(onComplete).not.toHaveBeenCalled();
  });
});
