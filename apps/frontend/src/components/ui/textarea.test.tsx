import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Textarea } from './textarea';

describe('Textarea', () => {
  it('renders without crashing', () => {
    render(<Textarea placeholder="Describe the issue" />);

    expect(screen.getByPlaceholderText('Describe the issue')).toBeInTheDocument();
  });

  it('applies custom class from props', () => {
    render(<Textarea aria-label="notes" className="custom-textarea" />);

    expect(screen.getByLabelText('notes').className).toContain('custom-textarea');
  });

  it('updates value and triggers onChange on typing', () => {
    const onChange = vi.fn();
    render(<Textarea aria-label="comment" onChange={onChange} />);

    const textareaEl = screen.getByLabelText('comment');
    if (!(textareaEl instanceof HTMLTextAreaElement)) throw new Error('Expected textarea');
    fireEvent.change(textareaEl, { target: { value: 'Updated details' } });

    expect(textareaEl.value).toBe('Updated details');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
