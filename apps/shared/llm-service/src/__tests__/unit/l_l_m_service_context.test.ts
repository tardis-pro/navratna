import { describe, expect, it } from 'vitest';
import { normalizeAgentContextMessages } from '../../context-manager/context_message_normalizer';

describe('normalizeAgentContextMessages', () => {
  it('converts string timestamps into canonical Date timestamps', () => {
    const [message] = normalizeAgentContextMessages([
      {
        id: 'msg-1',
        content: 'hello',
        sender: 'agent',
        timestamp: '2026-07-22T10:00:00.000Z',
        type: 'assistant',
      },
    ]);

    expect(message?.timestamp).toEqual(new Date('2026-07-22T10:00:00.000Z'));
    expect(message?.role).toBe('assistant');
    expect(message?.sender).toBe('agent');
  });

  it('supports absent timestamps deterministically', () => {
    const [message] = normalizeAgentContextMessages([
      {
        id: 'msg-2',
        content: 'hello',
        sender: 'user',
        type: 'user',
      },
    ]);

    expect(message?.timestamp).toEqual(new Date(0));
    expect(message?.role).toBe('user');
  });
});
