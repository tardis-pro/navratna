import { Server, Socket } from 'socket.io';
import { EventBusService } from '@uaip/infra/eventBus';
import { validateJWTToken } from '@uaip/middleware';
import { logger } from '@uaip/utils';

/**
 * CodingAgentSocketHandler
 *
 * Subscribes to `coding.agent.event` messages on RabbitMQ (published by
 * CodingAgentExecutor in capability-registry) and fans them out to connected
 * Socket.IO clients via the `/coding-agent` namespace.
 *
 * Frontend usage:
 *   const socket = io('http://localhost:3005/coding-agent', { auth: { token } });
 *   socket.emit('subscribe', sessionId);
 *   socket.on('agent:event', (event) => { ... });
 */

interface AgentConnection {
  userId: string;
  socketId: string;
  subscribedSessions: Set<string>;
}

interface CodingAgentEventData {
  type: string;
  sessionId: string;
  payload: Record<string, unknown>;
  timestamp: string | Date;
  [key: string]: unknown;
}

export class CodingAgentSocketHandler {
  private io: Server;
  private eventBus: EventBusService;
  private connections = new Map<string, AgentConnection>();
  // sessionId → Set<socketId>
  private sessionSubscribers = new Map<string, Set<string>>();

  constructor(io: Server, eventBus: EventBusService) {
    this.io = io;
    this.eventBus = eventBus;
    this.setupNamespace();
    this.subscribeToEventBus();
  }

  private setupNamespace(): void {
    const ns = this.io.of('/coding-agent');

    ns.on('connection', async (socket: Socket) => {
      try {
        const nginxUserId = socket.handshake.headers['x-user-id'] as string | undefined;
        let userId: string;

        if (nginxUserId && /^[0-9a-f-]{36}$/i.test(nginxUserId)) {
          userId = nginxUserId;
        } else {
          let token =
            (socket.handshake.auth?.token as string | undefined) ||
            (socket.handshake.query?.token as string | undefined);
          if (!token) {
            const cookieHeader = socket.handshake.headers.cookie;
            if (cookieHeader) {
              const accessTokenCookie = cookieHeader
                .split(';')
                .map((part: string) => part.trim())
                .find((part: string) => part.startsWith('access_token='));

              if (accessTokenCookie) {
                const encodedValue = accessTokenCookie.substring('access_token='.length);
                try {
                  token = decodeURIComponent(encodedValue);
                } catch {
                  token = encodedValue;
                }
              }
            }
          }
          if (!token) {
            socket.emit('error', { message: 'Authentication required' });
            socket.disconnect();
            return;
          }
          const decoded = await validateJWTToken(token);
          if (!decoded?.valid || !decoded?.userId) {
            socket.emit('error', { message: 'Invalid token' });
            socket.disconnect();
            return;
          }
          userId = decoded.userId;
        }

        const connection: AgentConnection = {
          userId,
          socketId: socket.id,
          subscribedSessions: new Set(),
        };
        this.connections.set(socket.id, connection);

        logger.info('Coding agent socket connected', { socketId: socket.id, userId });

        socket.on('subscribe', (sessionId: string) => {
          if (typeof sessionId !== 'string' || !sessionId) return;
          connection.subscribedSessions.add(sessionId);
          if (!this.sessionSubscribers.has(sessionId)) {
            this.sessionSubscribers.set(sessionId, new Set());
          }
          this.sessionSubscribers.get(sessionId)!.add(socket.id);
          logger.debug('Coding agent socket subscribed', { socketId: socket.id, sessionId });
          socket.emit('subscribed', { sessionId });
        });

        socket.on('unsubscribe', (sessionId: string) => {
          if (typeof sessionId !== 'string') return;
          connection.subscribedSessions.delete(sessionId);
          this.sessionSubscribers.get(sessionId)?.delete(socket.id);
          logger.debug('Coding agent socket unsubscribed', { socketId: socket.id, sessionId });
        });

        socket.on('disconnect', () => {
          const conn = this.connections.get(socket.id);
          if (conn) {
            conn.subscribedSessions.forEach((sid) => {
              this.sessionSubscribers.get(sid)?.delete(socket.id);
            });
          }
          this.connections.delete(socket.id);
          logger.info('Coding agent socket disconnected', { socketId: socket.id });
        });

        socket.emit('connected', { userId });
      } catch (error) {
        logger.error('Coding agent socket connection error', { error });
        socket.emit('error', { message: 'Connection failed' });
        socket.disconnect();
      }
    });
  }

  private subscribeToEventBus(): void {
    this.eventBus.subscribe('coding.agent.event', async (event) => {
      const data = event.data as CodingAgentEventData;
      if (!data?.sessionId) return;
      this.broadcastToSession(data.sessionId, data);
    });

    logger.info('CodingAgentSocketHandler subscribed to coding.agent.event');
  }

  private broadcastToSession(sessionId: string, data: CodingAgentEventData): void {
    const subscribers = this.sessionSubscribers.get(sessionId);
    if (!subscribers || subscribers.size === 0) return;

    const ns = this.io.of('/coding-agent');
    subscribers.forEach((socketId) => {
      const socket = ns.sockets.get(socketId);
      socket?.emit('agent:event', data);
    });
  }

  getStats(): { connections: number; activeSessions: number } {
    return {
      connections: this.connections.size,
      activeSessions: this.sessionSubscribers.size,
    };
  }
}
