import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Badge } from './badge';

describe('Badge', () => {
  it('renders without crashing', () => {
    render(<Badge>Active</Badge>);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies variant class from props', () => {
    render(<Badge variant="secondary">Team</Badge>);

    expect(screen.getByText('Team').className).toContain('bg-secondary');
  });

  it('handles click interaction when onClick is provided', () => {
    const onClick = vi.fn();
    render(<Badge onClick={onClick}>Press</Badge>);

    fireEvent.click(screen.getByText('Press'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
