import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  edenRequest: vi.fn(),
  socket: {
    connected: false,
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock('socket.io-client', () => ({
  io: () => mocks.socket,
}));

vi.mock('@/api/eden', () => ({
  edenRequest: mocks.edenRequest,
}));

import { useStreamingChat } from '../use_streaming_chat';

describe('useStreamingChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.socket.connected = false;
  });

  it('rejects before starting an HTTP stream when the socket is disconnected', async () => {
    const { result } = renderHook(() => useStreamingChat({ token: '' }));

    await act(async () => {
      await expect(result.current.startStream({ prompt: 'hello' })).rejects.toThrow(
        'Streaming socket is not connected'
      );
    });

    expect(mocks.edenRequest).not.toHaveBeenCalled();
  });

  it('starts and subscribes when the socket is connected', async () => {
    mocks.socket.connected = true;
    mocks.edenRequest.mockResolvedValue({ sessionId: 'stream-session-id' });
    const { result } = renderHook(() => useStreamingChat({ token: '' }));

    await act(async () => {
      await expect(result.current.startStream({ prompt: 'hello' })).resolves.toBe(
        'stream-session-id'
      );
    });

    expect(mocks.edenRequest).toHaveBeenCalledTimes(1);
    expect(mocks.socket.emit).toHaveBeenCalledWith('subscribe', 'stream-session-id');
  });
});
