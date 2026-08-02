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

/**
 * The slash menu is a sibling popover, not part of the textarea. CommandPicker
 * binds its keys on `window` in the CAPTURE phase, so its Enter handler runs
 * before the textarea's React onKeyDown — but preventDefault does not stop the
 * React handler, so both fire on a single press.
 */
describe('ChatComposer slash commands', () => {
  it('opens the command menu when the composer starts with a slash', () => {
    render(<ChatComposer onSubmit={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Message composer' }), {
      target: { value: '/' },
    });

    expect(screen.getByText('Insert Context Command')).toBeInTheDocument();
  });

  it('picks the command on Enter instead of sending the raw slash text', () => {
    const onSubmit = vi.fn();
    render(<ChatComposer onSubmit={onSubmit} />);

    const composer = screen.getByRole('textbox', { name: 'Message composer' });
    fireEvent.change(composer, { target: { value: '/ta' } });

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('ChatComposer model switcher', () => {
  const models = [
    { id: 'm1', name: 'dirt-cheap', provider: 'Tardis', isAvailable: true },
    { id: 'm2', name: 'ultra-smart-reliable', provider: 'Tardis', isAvailable: true },
  ] as never[];

  it('shows the agent default until the user overrides it', () => {
    render(
      <ChatComposer
        onSubmit={vi.fn()}
        models={models}
        agentDefaultModel="dirt-cheap"
        onModelChange={vi.fn()}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Select model' })).toHaveTextContent('dirt-cheap');
  });

  it('shows the override in place of the agent default once one is chosen', () => {
    render(
      <ChatComposer
        onSubmit={vi.fn()}
        models={models}
        model="ultra-smart-reliable"
        agentDefaultModel="dirt-cheap"
        onModelChange={vi.fn()}
      />
    );

    const trigger = screen.getByRole('combobox', { name: 'Select model' });
    expect(trigger).toHaveTextContent('ultra-smart-reliable');
    expect(trigger).not.toHaveTextContent('dirt-cheap');
  });

  it('stays hidden when no model catalogue is supplied', () => {
    render(<ChatComposer onSubmit={vi.fn()} />);
    expect(screen.queryByRole('combobox', { name: 'Select model' })).not.toBeInTheDocument();
  });
});
