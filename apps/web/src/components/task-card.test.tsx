import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  it('does not show pin or unpin chrome even when pinnedAt is set', () => {
    render(
      <TaskCard
        task={milk}
        onComplete={vi.fn()}
        onUncomplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /^(Pin|Unpin) task/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark task "Milk" as complete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More actions for task "Milk"' })).toBeTruthy();
  });

  it('hides Edit and Trash icons on a smart-view row and keeps ⋯', () => {
    render(
      <TaskCard
        task={milk}
        onComplete={vi.fn()}
        onUncomplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Drag to reorder Milk' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit task "Milk"' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete task "Milk"' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More actions for task "Milk"' })).toBeTruthy();
  });

  it('shows a grip and ⋯ on a one-pile row, not Edit or Trash icons', () => {
    render(
      <TaskCard
        task={milk}
        onComplete={vi.fn()}
        onUncomplete={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        dragHandle={inertHandle}
      />
    );

    expect(screen.getByRole('button', { name: 'Drag to reorder Milk' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More actions for task "Milk"' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit task "Milk"' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete task "Milk"' })).toBeNull();
  });

  it('offers Edit and Delete from ⋯', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <TaskCard
        task={milk}
        onComplete={vi.fn()}
        onUncomplete={vi.fn()}
        onDelete={onDelete}
        onEdit={onEdit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions for task "Milk"' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(milk));

    fireEvent.click(screen.getByRole('button', { name: 'More actions for task "Milk"' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(milk.id));
  });
});
