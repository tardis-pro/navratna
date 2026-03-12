import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Input } from './input';

describe('Input', () => {
  it('renders without crashing', () => {
    render(<Input placeholder="Search" />);

    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
  });

  it('applies custom class from props', () => {
    render(<Input aria-label="name" className="custom-input" />);

    expect(screen.getByLabelText('name').className).toContain('custom-input');
  });

  it('updates value and triggers onChange on typing', () => {
    const onChange = vi.fn();
    render(<Input aria-label="email" onChange={onChange} />);

    const input = screen.getByLabelText('email') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'user@example.com' } });

    expect(input.value).toBe('user@example.com');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
