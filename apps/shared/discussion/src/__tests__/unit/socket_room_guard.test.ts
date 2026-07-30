import { describe, it, expect, vi } from 'vitest';
import { inJoinedDiscussion } from '../../websocket/discussion_socket.js';

/**
 * Only join_discussion verifies access to a room. Every later participant-scoped
 * action re-accepts a discussionId from the client, so each one must prove the
 * socket actually joined that room or a client can inject events into rooms it
 * has no access to.
 */

type FakeSocket = {
  discussionId?: string;
  participantId?: string;
  emit: ReturnType<typeof vi.fn>;
};

function makeSocket(overrides: Partial<FakeSocket> = {}): FakeSocket {
  return { emit: vi.fn(), ...overrides };
}

describe('inJoinedDiscussion', () => {
  it('allows the room the socket actually joined', () => {
    const socket = makeSocket({ discussionId: 'disc-1', participantId: 'p1' });

    expect(inJoinedDiscussion(socket, 'disc-1')).toBe(true);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('refuses a different room and tells the client why', () => {
    const socket = makeSocket({ discussionId: 'disc-1', participantId: 'p1' });

    expect(inJoinedDiscussion(socket, 'disc-2')).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'NOT_IN_DISCUSSION' })
    );
  });

  it('refuses when the socket has joined nothing', () => {
    const socket = makeSocket();

    expect(inJoinedDiscussion(socket, 'disc-1')).toBe(false);
  });

  it('refuses when in the room but not resolved as a participant', () => {
    const socket = makeSocket({ discussionId: 'disc-1' });

    expect(inJoinedDiscussion(socket, 'disc-1')).toBe(false);
  });

  it('refuses an empty discussion id even if the socket state is also empty', () => {
    const socket = makeSocket({ participantId: 'p1' });

    expect(inJoinedDiscussion(socket, '')).toBe(false);
  });
});
