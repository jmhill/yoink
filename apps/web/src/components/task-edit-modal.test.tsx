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
});
