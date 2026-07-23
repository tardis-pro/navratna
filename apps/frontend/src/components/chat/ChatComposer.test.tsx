import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreadState, type AutocompleteSuggestion } from '@uaip/types';
import { ChatComposer } from './ChatComposer';

const AUTOCOMPLETE_DELAY_MS = 300;

const suggestion = {
  text: 'Summarize this discussion',
  type: 'common',
  score: 0.96,
} satisfies AutocompleteSuggestion;

describe('ChatComposer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps connection status outside the injected thread alert', () => {
    render(
      <ChatComposer
        disabled
        threadState={ThreadState.OFFLINE}
        onSubmit={vi.fn()}
      />
    );

    const alert = screen.getByRole('alert');
    expect(within(alert).queryByText('Offline')).not.toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('accepts an autocomplete suggestion by pointer click', async () => {
    vi.useFakeTimers();
    const fetchSuggestions = vi.fn().mockResolvedValue([suggestion]);

    render(
      <ChatComposer
        autocomplete={{ fetchSuggestions }}
        onSubmit={vi.fn()}
      />
    );

    const composer = screen.getByRole('textbox', { name: 'Message composer' });
    fireEvent.change(composer, { target: { value: 'Summ' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOCOMPLETE_DELAY_MS);
    });
    expect(fetchSuggestions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(suggestion.text));
    expect(composer).toHaveValue(`${suggestion.text} `);
  });
});
