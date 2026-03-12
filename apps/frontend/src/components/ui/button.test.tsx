import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders without crashing', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('applies variant and size classes from props', () => {
    render(
      <Button variant="destructive" size="sm">
        Delete
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button.className).toContain('bg-destructive');
    expect(button.className).toContain('h-9');
  });

  it('calls click handler on interaction', () => {
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Run</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
