import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Project } from '@yoink/api-contracts';
import { EditProjectDialog } from './edit-project-dialog';

const garden = (overrides: Partial<Project> = {}): Project => ({
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Garden',
  status: 'active',
  waitingOn: null,
  waitingSince: null,
  nextActionTaskId: null,
  notebookPages: [{ path: 'notes/Garden.md', url: 'https://notes.example/Garden.md' }],
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  createdAt: '2026-10-01T10:00:00.000Z',
  lastChangedAt: '2026-10-03T17:00:00.000Z',
  lastChangedBy: null,
  objective: 'Grow food',
  ...overrides,
});

const renderDialog = (project: Project, open = true) => {
  const onSave = vi.fn();
  const view = render(
    <EditProjectDialog
      open={open}
      onOpenChange={vi.fn()}
      project={project}
      isPending={false}
      error={null}
      onSave={onSave}
      onClearError={vi.fn()}
    />
  );
  return { ...view, onSave };
};

describe('EditProjectDialog', () => {
  it('keeps an in-progress rename when the same project refreshes', () => {
    const project = garden();
    const { rerender, onSave } = renderDialog(project);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Backyard' } });

    rerender(
      <EditProjectDialog
        open
        onOpenChange={vi.fn()}
        project={{ ...project, lastChangedAt: '2026-10-04T17:00:00.000Z' }}
        isPending={false}
        error={null}
        onSave={onSave}
        onClearError={vi.fn()}
      />
    );

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Backyard');
    expect((screen.getByLabelText('Objective') as HTMLTextAreaElement).value).toBe('Grow food');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Backyard',
      objective: 'Grow food',
      notebookPages: ['notes/Garden.md'],
    });
  });

  it('loads the saved name when the dialog opens again', () => {
    const project = garden();
    const onSave = vi.fn();
    const props = {
      onOpenChange: vi.fn(),
      project,
      isPending: false,
      error: null,
      onSave,
      onClearError: vi.fn(),
    };
    const { rerender } = render(<EditProjectDialog open {...props} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Backyard' } });

    rerender(<EditProjectDialog open={false} {...props} />);
    rerender(
      <EditProjectDialog
        open
        {...props}
        project={{ ...project, name: 'Garden', lastChangedAt: '2026-10-04T17:00:00.000Z' }}
      />
    );

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Garden');
  });
});
