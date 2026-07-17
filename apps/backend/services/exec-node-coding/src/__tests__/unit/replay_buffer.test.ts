// Unit tests for ReplayBuffer
import { describe, it, expect } from 'vitest';
import { ReplayBuffer } from '../../sse/replay_buffer.js';
import type { CodingSessionEvent } from '@uaip/types';

function makeEvent(seq: number): CodingSessionEvent {
  return {
    id: `sess-${seq}`,
    seq,
    sessionId: 'sess',
    timestamp: Date.now(),
    type: 'message_update',
    payload: { delta: `chunk ${seq}` },
  };
}

describe('ReplayBuffer', () => {
  it('starts empty', () => {
    const buf = new ReplayBuffer(10);
    expect(buf.all()).toHaveLength(0);
    expect(buf.lastSeq()).toBe(0);
  });

  it('returns events since a seq', () => {
    const buf = new ReplayBuffer(10);
    buf.push({ id: 'e1', seq: 1, event: makeEvent(1) });
    buf.push({ id: 'e2', seq: 2, event: makeEvent(2) });
    buf.push({ id: 'e3', seq: 3, event: makeEvent(3) });

    const result = buf.since(1);
    expect(result).toHaveLength(2);
    expect(result[0]?.seq).toBe(2);
    expect(result[1]?.seq).toBe(3);
  });

  it('returns empty when afterSeq equals lastSeq', () => {
    const buf = new ReplayBuffer(10);
    buf.push({ id: 'e1', seq: 5, event: makeEvent(5) });
    expect(buf.since(5)).toHaveLength(0);
  });

  it('evicts oldest when maxSize exceeded', () => {
    const buf = new ReplayBuffer(3);
    buf.push({ id: 'e1', seq: 1, event: makeEvent(1) });
    buf.push({ id: 'e2', seq: 2, event: makeEvent(2) });
    buf.push({ id: 'e3', seq: 3, event: makeEvent(3) });
    buf.push({ id: 'e4', seq: 4, event: makeEvent(4) });

    const all = buf.all();
    expect(all).toHaveLength(3);
    expect(all[0]?.seq).toBe(2);
    expect(all[2]?.seq).toBe(4);
  });

  it('returns correct lastSeq', () => {
    const buf = new ReplayBuffer(10);
    buf.push({ id: 'e7', seq: 7, event: makeEvent(7) });
    expect(buf.lastSeq()).toBe(7);
  });
});
