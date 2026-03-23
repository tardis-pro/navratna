import { Server, Socket } from 'socket.io';
import { EventBusService } from '@uaip/infra/eventBus';
import { validateJWTToken } from '@uaip/middleware';
import { logger } from '@uaip/utils';
import { StreamingEventType } from '@uaip/types';

interface StreamingConnection {
  userId: string;
  socketId: string;
  subscribedSessions: Set<string>;
}

export class StreamingHandler {
  private io: Server;
  private eventBus: EventBusService;
  private connections: Map<string, StreamingConnection> = new Map();
  private sessionSubscribers: Map<string, Set<string>> = new Map(); // sessionId -> Set<socketId>

  constructor(io: Server, eventBus: EventBusService) {
    this.io = io;
    this.eventBus = eventBus;
    this.setupNamespace();
    this.subscribeToEventBus();
  }

  private setupNamespace(): void {
    const streamNamespace = this.io.of('/streaming');

    streamNamespace.on('connection', async (socket: Socket) => {
      try {
        // Check for nginx-forwarded user headers first (preferred path)
        const nginxUserId = socket.handshake.headers['x-user-id'] as string | undefined;
        let userId: string;

        if (nginxUserId) {
          // Validate userId is a proper UUID
          const UUID_REGEX =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (!UUID_REGEX.test(nginxUserId)) {
            socket.emit('error', { message: 'Invalid user ID format' });
            socket.disconnect();
            return;
          }
          userId = nginxUserId;
        } else {
          // Fallback: Authenticate via token
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

        const connection: StreamingConnection = {
          userId,
          socketId: socket.id,
          subscribedSessions: new Set(),
        };

        this.connections.set(socket.id, connection);

        logger.info('Streaming connection established', {
          socketId: socket.id,
          userId,
        });

        // Handle subscription to a stream session
        socket.on('subscribe', (sessionId: string) => {
          connection.subscribedSessions.add(sessionId);

          if (!this.sessionSubscribers.has(sessionId)) {
            this.sessionSubscribers.set(sessionId, new Set());
          }
          this.sessionSubscribers.get(sessionId)!.add(socket.id);

          logger.debug('Socket subscribed to stream', { socketId: socket.id, sessionId });
        });

        // Handle unsubscription
        socket.on('unsubscribe', (sessionId: string) => {
          connection.subscribedSessions.delete(sessionId);
          this.sessionSubscribers.get(sessionId)?.delete(socket.id);

          logger.debug('Socket unsubscribed from stream', { socketId: socket.id, sessionId });
        });

        // Handle stream cancellation request
        socket.on('cancel-stream', async (sessionId: string) => {
          await this.eventBus.publish('llm.stream.cancel.request', {
            sessionId,
            userId,
          });
        });

        // Cleanup on disconnect
        socket.on('disconnect', () => {
          const conn = this.connections.get(socket.id);
          if (conn) {
            conn.subscribedSessions.forEach((sessionId) => {
              this.sessionSubscribers.get(sessionId)?.delete(socket.id);
            });
          }
          this.connections.delete(socket.id);
          logger.info('Streaming connection closed', { socketId: socket.id });
        });

        socket.emit('connected', { userId });
      } catch (error) {
        logger.error('Streaming connection error:', error);
        socket.emit('error', { message: 'Connection failed' });
        socket.disconnect();
      }
    });
  }

  private subscribeToEventBus(): void {
    // Define common event data type
    interface StreamEventData {
      sessionId: string;
      chunk?: any;
      error?: string;
      [key: string]: any;
    }

    // Stream start
    this.eventBus.subscribe('llm.stream.start', async (event) => {
      const data = event.data as StreamEventData;
      this.broadcastToSession(data.sessionId, StreamingEventType.STREAM_START, data);
    });

    // Stream chunks
    this.eventBus.subscribe('llm.stream.chunk', async (event) => {
      const data = event.data as StreamEventData;
      this.broadcastToSession(data.sessionId, StreamingEventType.STREAM_CHUNK, data);
    });

    // Stream end
    this.eventBus.subscribe('llm.stream.end', async (event) => {
      const data = event.data as StreamEventData;
      this.broadcastToSession(data.sessionId, StreamingEventType.STREAM_END, data);
      // Cleanup subscribers
      this.sessionSubscribers.delete(data.sessionId);
    });

    // Stream error
    this.eventBus.subscribe('llm.stream.error', async (event) => {
      const data = event.data as StreamEventData;
      this.broadcastToSession(data.sessionId, StreamingEventType.STREAM_ERROR, data);
      this.sessionSubscribers.delete(data.sessionId);
    });

    // Stream cancelled
    this.eventBus.subscribe('llm.stream.cancel', async (event) => {
      const data = event.data as StreamEventData;
      this.broadcastToSession(data.sessionId, StreamingEventType.STREAM_CANCEL, data);
      this.sessionSubscribers.delete(data.sessionId);
    });

    logger.info('Subscribed to streaming events');
  }

  private broadcastToSession(sessionId: string, eventType: string, data: any): void {
    const subscribers = this.sessionSubscribers.get(sessionId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const streamNamespace = this.io.of('/streaming');

    subscribers.forEach((socketId) => {
      const socket = streamNamespace.sockets.get(socketId);
      if (socket) {
        socket.emit(eventType, data);
      }
    });
  }

  /**
   * Get connection stats
   */
  getStats(): { connections: number; activeSessions: number } {
    return {
      connections: this.connections.size,
      activeSessions: this.sessionSubscribers.size,
    };
  }
}
