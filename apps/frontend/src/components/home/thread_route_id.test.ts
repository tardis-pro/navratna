import { describe, it, expect } from 'vitest';
import {
  encodeThreadRouteId,
  decodeThreadRouteId,
  isThreadRouteId,
} from './thread_route_id';

const AGENT = 'aaaaaaa1-0000-4000-8000-000000000005';
const THREAD = 'bbbbbbb1-0000-4000-8000-000000000007';

describe('thread route id', () => {
  it('round-trips an agent and thread key', () => {
    const encoded = encodeThreadRouteId({ agentId: AGENT, threadKey: THREAD });
    expect(decodeThreadRouteId(encoded)).toEqual({ agentId: AGENT, threadKey: THREAD });
  });

  it('keeps the legacy shape when no thread key is given', () => {
    // A url produced before threads existed must still resolve, and the server
    // derives the thread from the agent id when the key is absent.
    expect(encodeThreadRouteId({ agentId: AGENT })).toBe(`agent-thread-${AGENT}`);
    expect(decodeThreadRouteId(`agent-thread-${AGENT}`)).toEqual({ agentId: AGENT });
  });

  it('rejects ids that are not thread routes', () => {
    expect(decodeThreadRouteId('discussion-123')).toBeNull();
    expect(decodeThreadRouteId('agent-thread-')).toBeNull();
    expect(isThreadRouteId('agent-thread-')).toBe(false);
  });

  it('rejects a half-formed key rather than inventing one', () => {
    // Silently dropping the empty half would send the user to a DIFFERENT thread
    // than the url names, so this must fail loudly instead.
    expect(decodeThreadRouteId(`agent-thread-${AGENT}~`)).toBeNull();
    expect(decodeThreadRouteId('agent-thread-~key')).toBeNull();
  });

  it('treats only the first separator as the boundary', () => {
    const decoded = decodeThreadRouteId(`agent-thread-${AGENT}~a~b`);
    expect(decoded).toEqual({ agentId: AGENT, threadKey: 'a~b' });
  });
});
