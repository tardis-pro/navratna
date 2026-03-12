import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('renders without crashing', () => {
    render(
      <Card>
        <CardContent>Body</CardContent>
      </Card>
    );

    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('renders composed sections and applies className prop', () => {
    render(
      <Card className="custom-card">
        <CardHeader>
          <CardTitle>Metrics</CardTitle>
          <CardDescription>Current cycle</CardDescription>
        </CardHeader>
      </Card>
    );

    const title = screen.getByText('Metrics');
    expect(title).toBeInTheDocument();
    expect(screen.getByText('Current cycle')).toBeInTheDocument();
    expect(title.closest('.custom-card')).toBeInTheDocument();
  });

  it('supports interaction inside footer content', () => {
    const onClick = vi.fn();

    render(
      <Card>
        <CardFooter>
          <button type="button" onClick={onClick}>
            Continue
          </button>
        </CardFooter>
      </Card>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
