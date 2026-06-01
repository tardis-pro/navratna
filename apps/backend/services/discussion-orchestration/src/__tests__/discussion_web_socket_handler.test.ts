import { WebSocket } from 'ws';
import {
  DiscussionWebSocketHandler,
  DiscussionOrchestrationService,
} from '@uaip/discussion-core';
import type { WebSocketConnection } from '@uaip/discussion-core';

vi.mock('../../../../../shared/discussion/src/websocket/websocket_security_utils.js', () => ({
  authenticateConnection: vi.fn(() => ({
    authenticated: true,
    userId: 'user-1',
    securityLevel: 2,
  })),
  isValidUUID: vi.fn(() => true),
  sanitizeContent: vi.fn((content: string) => content),
  generateSecureConnectionId: vi.fn(() => 'conn-test-id'),
  checkWebSocketRateLimit: vi.fn(() => true),
  validateMessageSize: vi.fn(() => true),
}));

vi.mock('../../../../../shared/discussion/src/websocket/redis_session_manager.js', () => {
  const RedisSessionManager = vi.fn().mockImplementation(function () {
    this.checkConnectionLimits = vi.fn().mockResolvedValue(true);
    this.createSession = vi.fn().mockResolvedValue(undefined);
    this.removeSession = vi.fn().mockResolvedValue(undefined);
    this.cleanupExpiredSessions = vi.fn().mockResolvedValue(undefined);
    this.getSessionStats = vi.fn().mockResolvedValue({ totalSessions: 0, activeUsers: 0, activeDiscussions: 0 });
    this.destroy = vi.fn().mockResolvedValue(undefined);
  });
  return { RedisSessionManager };
});

type HandlerInternals = {
  connectionTimers: Map<string, NodeJS.Timeout>;
  connectionById: Map<string, WebSocketConnection>;
  handleDisconnection: (
    connection: WebSocketConnection,
    code: number,
    reason?: string
  ) => Promise<void>;
  handleMessage: (connection: WebSocketConnection, data: Buffer) => Promise<void>;
  removeConnectionAtomic: (connection: WebSocketConnection) => Promise<void>;
};

function createMockOrchestrationService(): DiscussionOrchestrationService {
  return {
    on: vi.fn(),
    verifyParticipantAccess: vi.fn().mockResolvedValue(true),
  } as DiscussionOrchestrationService;
}

function createConnection(): WebSocketConnection {
  const wsMock = {
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    removeAllListeners: vi.fn(),
    readyState: WebSocket.OPEN,
  } as WebSocket;

  return {
    ws: wsMock,
    discussionId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    participantId: '33333333-3333-4333-8333-333333333333',
    isAlive: true,
    lastPing: new Date('2026-01-01T00:00:00Z'),
    connectionId: 'conn-1',
    authenticated: true,
    securityLevel: 2,
    messageCount: 0,
    lastActivity: new Date('2026-01-01T00:00:00Z'),
    rateLimitReset: Date.now() + 60000,
  };
}

describe('DiscussionWebSocketHandler', () => {
  let handler: DiscussionWebSocketHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    handler = new DiscussionWebSocketHandler(createMockOrchestrationService());
  });

  afterEach(async () => {
    await handler.destroy();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('handleDisconnection clears connection timer and removes listeners', async () => {
    // @ts-expect-error -- accessing private class internals for test verification
    const internals = handler as HandlerInternals;
    const connection = createConnection();
    const timeoutHandle = setTimeout(() => undefined, 1000);

    internals.connectionTimers.set(connection.connectionId, timeoutHandle);

    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const removeConnectionAtomicSpy = vi
      .spyOn(internals, 'removeConnectionAtomic')
      .mockResolvedValue(undefined);

    await internals.handleDisconnection(connection, 1000, 'client closed');

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutHandle);
    expect(internals.connectionTimers.has(connection.connectionId)).toBe(false);
    expect(connection.ws.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(removeConnectionAtomicSpy).toHaveBeenCalledWith(connection);
  });

  it('tracks per-connection message count during message handling', async () => {
    // @ts-expect-error -- accessing private class internals for test verification
    const internals = handler as HandlerInternals;
    const connection = createConnection();
    internals.connectionById.set(connection.connectionId, connection);

    await internals.handleMessage(connection, Buffer.from(JSON.stringify({ type: 'ping' })));
    await internals.handleMessage(connection, Buffer.from(JSON.stringify({ type: 'ping' })));

    expect(connection.messageCount).toBe(2);
    expect(connection.lastActivity.getTime()).toBeGreaterThan(0);
    expect(connection.ws.send).toHaveBeenCalledTimes(2);
    expect(connection.ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"pong"'));
  });
});
