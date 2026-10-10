import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Task } from '@yoink/api-contracts';
import { TaskEditModal } from './task-edit-modal';

const milk: Task = {
  id: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000010',
  createdById: '00000000-0000-4000-8000-000000000011',
  title: 'Milk',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
};

describe('TaskEditModal', () => {
  it('offers Delete inside the edit dialog', () => {
    const onDelete = vi.fn();
    render(
      <TaskEditModal
        open
        onOpenChange={vi.fn()}
        task={milk}
        sourceCapture={null}
        onSave={vi.fn()}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(milk.id);
  });

  it('keeps in-progress typing when the same task is refreshed underneath', () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <TaskEditModal
        open
        onOpenChange={vi.fn()}
        task={milk}
        sourceCapture={null}
        onSave={onSave}
        onDelete={vi.fn()}
      />
    );

    const title = screen.getByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Oat milk' } });

    rerender(
      <TaskEditModal
        open
        onOpenChange={vi.fn()}
        task={{ ...milk, title: 'Bot renamed this' }}
        sourceCapture={null}
        onSave={onSave}
        onDelete={vi.fn()}
      />
    );

    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Oat milk');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(milk.id, { title: 'Oat milk' });
  });

  it('does not swap the original capture for a loading placeholder on background refetch', () => {
    render(
      <TaskEditModal
        open
        onOpenChange={vi.fn()}
        task={{ ...milk, captureId: '00000000-0000-4000-8000-000000000021' }}
        sourceCapture={{
          id: '00000000-0000-4000-8000-000000000021',
          organizationId: milk.organizationId,
          createdById: milk.createdById,
          content: 'Grab milk',
          status: 'processed',
          capturedAt: '2026-01-01T00:00:00.000Z',
        }}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        isLoadingCapture={false}
      />
    );

    expect(screen.getByText('Grab milk')).toBeTruthy();
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('shows added, last changed, and completed on the edit screen', () => {
    render(
      <TaskEditModal
        open
        onOpenChange={vi.fn()}
        task={{
          ...milk,
          lastChangedAt: '2026-01-02T00:00:00.000Z',
          lastChangedBy: null,
          completedAt: '2026-01-03T00:00:00.000Z',
          completedBy: null,
        }}
        sourceCapture={null}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        members={[{ userId: milk.createdById, label: 'alice@example.com' }]}
      />
    );

    expect(screen.getByTestId('task-edit-added').textContent).toContain('Added');
    expect(screen.getByTestId('task-edit-added').textContent).toContain('alice@example.com');
    expect(screen.getByTestId('task-edit-last-changed').textContent).toContain('Last changed');
    expect(screen.getByTestId('task-edit-completed').textContent).toContain('Completed');
  });

  it('shows the bot name on last changed and completed', () => {
    render(
      <TaskEditModal
        open
        onOpenChange={vi.fn()}
        task={{
          ...milk,
          lastChangedAt: '2026-01-02T00:00:00.000Z',
          lastChangedBy: 'user-lane',
          completedAt: '2026-01-03T00:00:00.000Z',
          completedBy: 'user-lane',
        }}
        sourceCapture={null}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        members={[
          { userId: milk.createdById, label: 'alice@example.com' },
          { userId: 'user-lane', label: 'Lane' },
        ]}
      />
    );

    expect(screen.getByTestId('task-edit-last-changed').textContent).toContain('by Lane');
    expect(screen.getByTestId('task-edit-completed').textContent).toContain('by Lane');
  });

  it('shows before history started when lastChangedAt is missing', () => {
    render(
      <TaskEditModal
        open
        onOpenChange={vi.fn()}
        task={{ ...milk, lastChangedAt: null }}
        sourceCapture={null}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByTestId('task-edit-last-changed').textContent).toBe(
      'Last changed before history started'
    );
    expect(screen.queryByTestId('task-edit-completed')).toBeNull();
  });
});
