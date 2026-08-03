import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThreadState, ThreadPresence } from '@uaip/types';
import type { Thread } from '@uaip/types';
import { ThreadDock } from './ThreadDock';

const AGENT = 'aaaaaaa1-0000-4000-8000-000000000005';

function makeThread(overrides: Partial<Thread> & { metadata: Record<string, unknown> }): Thread {
  return {
    id: 'thread-1',
    participants: [
      { type: 'agent', agentId: AGENT, name: 'Taniye', avatar: '', role: 'assistant' },
    ],
    messages: [],
    state: ThreadState.ACTIVE,
    presence: ThreadPresence.RESTING,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Thread;
}

describe('ThreadDock selection', () => {
  it('highlights only the open thread when one agent has several', () => {
    const threads = [
      makeThread({ id: 't-a', metadata: { agentId: AGENT, threadKey: 'key-a', conversationId: 'c-a' } }),
      makeThread({ id: 't-b', metadata: { agentId: AGENT, threadKey: 'key-b', conversationId: 'c-b' } }),
    ];

    render(
      <ThreadDock
        threads={threads}
        selectedAgentId={AGENT}
        selectedThreadKey="key-b"
        onSelectThread={vi.fn()}
      />
    );

    const cards = screen.getAllByRole('button', { name: /Agent Taniye/ });
    // Matching on the agent alone would light up BOTH rows, which is exactly the
    // bug that makes several threads per agent unusable.
    expect(cards[0].className).not.toContain('bg-muted shadow-sm');
    expect(cards[1].className).toContain('bg-muted shadow-sm');
  });

  it('treats the default thread as selected only when no key is open', () => {
    const threads = [
      makeThread({ id: 't-default', metadata: { agentId: AGENT, conversationId: 'c-a' } }),
    ];

    render(
      <ThreadDock
        threads={threads}
        selectedAgentId={AGENT}
        selectedThreadKey={undefined}
        onSelectThread={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Agent Taniye/ }).className).toContain(
      'bg-muted shadow-sm'
    );
  });
});

describe('ThreadDock rename', () => {
  it('renames with the conversation id, not the route id', () => {
    const onRenameThread = vi.fn();
    const threads = [
      makeThread({
        id: 'agent-thread-xyz~key-a',
        metadata: { agentId: AGENT, threadKey: 'key-a', conversationId: 'conversation-77' },
      }),
    ];

    render(
      <ThreadDock
        threads={threads}
        selectedAgentId={null}
        onSelectThread={vi.fn()}
        onRenameThread={onRenameThread}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Rename Taniye/ }));
    const input = screen.getByLabelText('Thread title');
    fireEvent.change(input, { target: { value: 'Weather chat' } });
    fireEvent.submit(input.closest('form')!);

    // The dock renders route ids, but the API is keyed by conversation id —
    // passing the route id would 404 on every rename.
    expect(onRenameThread).toHaveBeenCalledWith('conversation-77', 'Weather chat');
  });

  it('offers no controls for a thread that has no conversation yet', () => {
    const threads = [makeThread({ id: 't-empty', metadata: { agentId: AGENT } })];

    render(
      <ThreadDock
        threads={threads}
        selectedAgentId={null}
        onSelectThread={vi.fn()}
        onRenameThread={vi.fn()}
        onArchiveThread={vi.fn()}
      />
    );

    // A placeholder row has nothing on the server to rename or archive.
    expect(screen.queryByRole('button', { name: /Rename/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Archive/ })).toBeNull();
  });
});
