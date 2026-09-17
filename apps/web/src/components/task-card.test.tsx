import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Task } from '@yoink/api-contracts';
import { TaskCard } from './task-card';

const milk: Task = {
  id: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000010',
  createdById: '00000000-0000-4000-8000-000000000011',
  title: 'Milk',
  createdAt: '2026-01-01T00:00:00.000Z',
  pinnedAt: '2026-01-02T00:00:00.000Z',
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
    expect(screen.getByRole('button', { name: 'Edit task "Milk"' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete task "Milk"' })).toBeTruthy();
  });
});
