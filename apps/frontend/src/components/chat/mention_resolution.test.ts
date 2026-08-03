import { describe, it, expect } from 'vitest';
import { resolveMentionedAgentIds } from './mention_resolution';

const TANIYE = { id: 'aaaaaaa1-0000-4000-8000-000000000001', name: 'Taniye' };
const MAYA = { id: 'bbbbbbb1-0000-4000-8000-000000000002', name: 'Maya' };
const TWO_WORDS = { id: 'ccccccc1-0000-4000-8000-000000000003', name: 'Dr Quinn' };

describe('resolveMentionedAgentIds', () => {
  it('resolves a mention to the agent id, not the typed name', () => {
    expect(resolveMentionedAgentIds('@Taniye what is up', [TANIYE, MAYA])).toEqual([TANIYE.id]);
  });

  it('resolves several mentions in one message', () => {
    expect(resolveMentionedAgentIds('@Taniye @Maya thoughts?', [TANIYE, MAYA])).toEqual([
      TANIYE.id,
      MAYA.id,
    ]);
  });

  it('matches the underscore form the composer inserts for multi-word names', () => {
    // The picker rewrites "Dr Quinn" to "@Dr_Quinn", so matching on the raw name
    // would never resolve any agent whose name contains a space.
    expect(resolveMentionedAgentIds('@Dr_Quinn hello', [TWO_WORDS])).toEqual([TWO_WORDS.id]);
  });

  it('drops a token that matches no visible agent', () => {
    // Forwarding an unmatched token as if it were an id would send the server a
    // value it must then reject — or that could collide with a real agent id.
    expect(resolveMentionedAgentIds('@Nobody hi', [TANIYE])).toEqual([]);
  });

  it('returns each agent once even when mentioned repeatedly', () => {
    expect(resolveMentionedAgentIds('@Taniye and again @Taniye', [TANIYE])).toEqual([TANIYE.id]);
  });

  it('is case-insensitive, since the user retypes names by hand', () => {
    expect(resolveMentionedAgentIds('@taniye hi', [TANIYE])).toEqual([TANIYE.id]);
  });

  it('returns nothing for a message with no mentions', () => {
    expect(resolveMentionedAgentIds('just a normal message', [TANIYE, MAYA])).toEqual([]);
  });

  it('ignores an email-looking string rather than treating it as a mention', () => {
    expect(resolveMentionedAgentIds('write to maya@example.com', [MAYA])).toEqual([]);
  });
});
