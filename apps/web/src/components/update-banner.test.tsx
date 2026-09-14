import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpdateBanner } from './update-banner';

describe('UpdateBanner', () => {
  it('calls onRefresh when Refresh is clicked', () => {
    const onRefresh = vi.fn();
    render(
      <UpdateBanner onRefresh={onRefresh} onDismiss={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows Updating... and disables actions while an update is in progress', () => {
    render(
      <UpdateBanner onRefresh={vi.fn()} onDismiss={vi.fn()} isUpdating />
    );

    const refreshButton = screen.getByRole('button', { name: 'Updating...' });
    expect(refreshButton).toHaveProperty('disabled', true);
    expect(refreshButton.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveProperty(
      'disabled',
      true
    );
  });

  it('uses theme tokens instead of hard-coded blue', () => {
    const { container } = render(
      <UpdateBanner onRefresh={vi.fn()} onDismiss={vi.fn()} />
    );

    const className = (container.firstChild as HTMLElement).className;
    expect(className).toContain('bg-primary/10');
    expect(className).toContain('text-primary');
    expect(className).not.toContain('bg-blue-100');
  });
});
