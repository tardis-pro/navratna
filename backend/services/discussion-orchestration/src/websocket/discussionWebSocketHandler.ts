import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '@uaip/utils';
import { DiscussionOrchestrationService } from '../services/discussionOrchestrationService.js';
import { DiscussionEvent } from '@uaip/types';
import { z } from 'zod';
import {
  authenticateConnection,
  isValidUUID,
  sanitizeContent,
  generateSecureConnectionId,
  checkWebSocketRateLimit,
  validateMessageSize,
} from './websocket-security-utils.js';
import { RedisSessionManager } from './redis-session-manager.js';

export interface WebSocketConnection {
  ws: WebSocket;
  discussionId: string;
  userId?: string;
  participantId?: string;
  isAlive: boolean;
  lastPing: Date;
  connectionId: string;
  authenticated: boolean;
  securityLevel: number;
  messageCount: number;
  lastActivity: Date;
  rateLimitReset: number;
}

// Message validation schemas
const WebSocketMessageSchema = z.object({
  type: z.string(),
  data: z.record(z.any()).optional(),
  messageId: z.string().optional(),
});

// Rate limiting constants
const WS_RATE_LIMITS = {
  MESSAGES_PER_MINUTE: 60,
  MAX_MESSAGE_SIZE: 32768, // 32KB
  MAX_CONNECTIONS_PER_USER: 5,
};

export class DiscussionWebSocketHandler {
  private connections: Map<string, Set<WebSocketConnection>> = new Map();
  private connectionById: Map<string, WebSocketConnection> = new Map();
  private orchestrationService: DiscussionOrchestrationService;
  private heartbeatInterval: NodeJS.Timeout;
  private cleanupInterval: NodeJS.Timeout;
  private redisSessionManager: RedisSessionManager;

  constructor(orchestrationService: DiscussionOrchestrationService) {
    this.orchestrationService = orchestrationService;

    // Initialize Redis session manager
    this.redisSessionManager = new RedisSessionManager({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 2, // Use separate DB for WebSocket sessions
    });

    // Start heartbeat to keep connections alive
    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, 30000); // Every 30 seconds

    // Start cleanup interval for stale data
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleData();
    }, 60000); // Every minute

    // Subscribe to discussion events from the orchestration service
    this.subscribeToEvents();
  }

  /**
   * Handle new WebSocket connection with enhanced security
   */
  async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    const connectionId = this.generateConnectionId();

    try {
      // Extract discussion ID from URL path
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const pathParts = url.pathname.split('/');
      const discussionId = pathParts[2]; // /discussions/{discussionId}/ws

      if (!discussionId || !this.isValidUUID(discussionId)) {
        logger.warn('WebSocket connection rejected: invalid discussion ID', {
          connectionId,
          discussionId,
          ip: request.socket.remoteAddress,
        });
        ws.close(1008, 'Invalid discussion ID');
        return;
      }

      // Authenticate the connection
      const authResult = authenticateConnection(request, connectionId);
      if (!authResult.authenticated) {
        logger.warn('WebSocket connection rejected: authentication failed', {
          connectionId,
          discussionId,
          reason: authResult.reason,
          ip: request.socket.remoteAddress,
        });
        ws.close(1008, authResult.reason || 'Authentication failed');
        return;
      }

      const { userId, securityLevel } = authResult;
      const participantId = url.searchParams.get('participantId');

      // Create connection object
      const connection: WebSocketConnection = {
        ws,
        discussionId,
        userId,
        participantId,
        isAlive: true,
        lastPing: new Date(),
        connectionId,
        authenticated: true,
        securityLevel,
        messageCount: 0,
        lastActivity: new Date(),
        rateLimitReset: Date.now() + 60000,
      };

      // Check connection limits per user using Redis
      const canConnect = await this.redisSessionManager.checkConnectionLimits(
        userId,
        WS_RATE_LIMITS.MAX_CONNECTIONS_PER_USER
      );
      if (!canConnect) {
        logger.warn('WebSocket connection rejected: too many connections', {
          connectionId,
          userId,
          discussionId,
        });
        ws.close(1008, 'Too many connections');
        return;
      }

      // Continue with connection setup if allowed
      await this.continueConnectionSetup(
        connection,
        request.socket.remoteAddress,
        request.headers['user-agent'] as string
      );
    } catch (error) {
      logger.error('Error handling WebSocket connection', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        url: request.url,
        ip: request.socket.remoteAddress,
      });
      ws.close(1011, 'Internal server error');
    }
  }

  /**
   * Connection setup continuation method
   */
  private async continueConnectionSetup(
    connection: WebSocketConnection,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      logger.info('Setting up WebSocket connection', {
        connectionId: connection.connectionId,
        discussionId: connection.discussionId,
        userId: connection.userId,
      });

      // Add connection atomically and store in Redis
      await this.addConnectionAtomic(connection, ipAddress, userAgent);

      // Send initial connection confirmation
      this.sendToConnection(connection, {
        type: 'connection.established',
        data: {
          discussionId: connection.discussionId,
          connectionId: connection.connectionId,
          securityLevel: connection.securityLevel,
          rateLimits: WS_RATE_LIMITS,
          timestamp: new Date(),
        },
      });

      // Set up WebSocket event handlers
      this.setupWebSocketHandlers(connection);

      // Verify participant access
      this.verifyAndNotifyAccess(connection);
    } catch (error) {
      logger.error('Error in connection setup continuation', {
        connectionId: connection.connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      connection.ws.close(1011, 'Internal server error');
    }
  }

  /**
   * Add connection atomically to prevent race conditions
   */
  private async addConnectionAtomic(
    connection: WebSocketConnection,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      // Add to discussion-specific connections
      if (!this.connections.has(connection.discussionId)) {
        this.connections.set(connection.discussionId, new Set());
      }
      this.connections.get(connection.discussionId)!.add(connection);

      // Add to connection ID lookup
      this.connectionById.set(connection.connectionId, connection);

      // Store session in Redis
      await this.redisSessionManager.createSession(connection, ipAddress, userAgent);

      logger.debug('Connection added atomically with Redis session', {
        connectionId: connection.connectionId,
        discussionId: connection.discussionId,
        userId: connection.userId,
        totalConnections: this.connectionById.size,
      });
    } catch (error) {
      logger.error('Failed to add connection atomically', {
        connectionId: connection.connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Remove connection atomically
   */
  private async removeConnectionAtomic(connection: WebSocketConnection): Promise<void> {
    try {
      // Remove from discussion-specific connections
      const discussionConnections = this.connections.get(connection.discussionId);
      if (discussionConnections) {
        discussionConnections.delete(connection);
        if (discussionConnections.size === 0) {
          this.connections.delete(connection.discussionId);
        }
      }

      // Remove from connection ID lookup
      this.connectionById.delete(connection.connectionId);

      // Remove session from Redis
      await this.redisSessionManager.removeSession(connection.connectionId);

      logger.debug('Connection removed atomically with Redis cleanup', {
        connectionId: connection.connectionId,
        discussionId: connection.discussionId,
        userId: connection.userId,
        totalConnections: this.connectionById.size,
      });
    } catch (error) {
      logger.error('Failed to remove connection atomically', {
        connectionId: connection.connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Generate secure connection ID
   */
  private generateConnectionId(): string {
    return generateSecureConnectionId();
  }

  /**
   * Validate UUID format
   */
  private isValidUUID(str: string): boolean {
    return isValidUUID(str);
  }

  /**
   * Clean up stale data periodically using Redis
   */
  private async cleanupStaleData(): Promise<void> {
    try {
      // Clean up Redis sessions
      await this.redisSessionManager.cleanupExpiredSessions();

      // Log session statistics
      const stats = await this.redisSessionManager.getSessionStats();

      logger.debug('Stale data cleanup completed', {
        localConnections: this.connectionById.size,
        redisStats: stats,
      });

      // Sync local connections with Redis if there's a mismatch
      if (stats.totalSessions !== this.connectionById.size) {
        logger.warn('Local connections out of sync with Redis', {
          localCount: this.connectionById.size,
          redisCount: stats.totalSessions,
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup stale data', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Set up WebSocket event handlers for a connection
   */
  private setupWebSocketHandlers(connection: WebSocketConnection): void {
    const { ws } = connection;

    ws.on('message', (data) => {
      this.handleMessage(connection, data);
    });

    ws.on('close', (code, reason) => {
      this.handleDisconnection(connection, code, reason?.toString());
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', {
        connectionId: connection.connectionId,
        error: error.message,
      });
    });

    ws.on('pong', () => {
      connection.isAlive = true;
      connection.lastPing = new Date();
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(connection: WebSocketConnection, data: any): Promise<void> {
    try {
      connection.lastActivity = new Date();
      connection.messageCount++;

      // Parse message
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (error) {
        this.sendError(connection.connectionId, 'Invalid JSON format');
        return;
      }

      // Validate message structure
      const validatedMessage = WebSocketMessageSchema.parse(message);

      // Handle different message types
      switch (validatedMessage.type) {
        case 'ping':
          this.sendToConnection(connection, { type: 'pong', data: { timestamp: new Date() } });
          break;
        default:
          logger.warn('Unknown message type', {
            connectionId: connection.connectionId,
            type: validatedMessage.type,
          });
      }
    } catch (error) {
      logger.error('Error handling message', {
        connectionId: connection.connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.sendError(connection.connectionId, 'Message processing failed');
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private async handleDisconnection(
    connection: WebSocketConnection,
    code: number,
    reason?: string
  ): Promise<void> {
    logger.info('WebSocket disconnected', {
      connectionId: connection.connectionId,
      discussionId: connection.discussionId,
      userId: connection.userId,
      code,
      reason,
    });

    await this.removeConnectionAtomic(connection);
  }

  /**
   * Send message to a specific connection
   */
  private sendToConnection(connection: WebSocketConnection, message: any): void {
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error message to connection
   */
  private sendError(connectionId: string, message: string): void {
    const connection = this.connectionById.get(connectionId);
    if (connection) {
      this.sendToConnection(connection, {
        type: 'error',
        data: { message },
      });
    }
  }

  /**
   * Verify participant access and notify
   */
  private async verifyAndNotifyAccess(connection: WebSocketConnection): Promise<void> {
    try {
      // Verify access with orchestration service
      const hasAccess = await this.orchestrationService.verifyParticipantAccess(
        connection.discussionId,
        connection.userId!
      );

      if (hasAccess) {
        this.sendToConnection(connection, {
          type: 'access.verified',
          data: {
            discussionId: connection.discussionId,
            participantId: connection.participantId,
          },
        });
      } else {
        connection.ws.close(1008, 'Access denied');
      }
    } catch (error) {
      logger.error('Failed to verify participant access', {
        connectionId: connection.connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      connection.ws.close(1011, 'Verification failed');
    }
  }

  /**
   * Subscribe to discussion events
   */
  private subscribeToEvents(): void {
    this.orchestrationService.on('discussion_event', (event: DiscussionEvent) => {
      this.broadcastToDiscussion(event.discussionId, {
        type: 'discussion.event',
        data: event,
      });
    });
  }

  /**
   * Broadcast message to all connections in a discussion
   */
  public broadcastToDiscussion(discussionId: string, message: any): void {
    const connections = this.connections.get(discussionId);
    if (connections) {
      connections.forEach((connection) => {
        this.sendToConnection(connection, message);
      });
    }
  }

  /**
   * Heartbeat to keep connections alive
   */
  private heartbeat(): void {
    const now = new Date();
    const staleThreshold = 60000; // 1 minute

    this.connectionById.forEach((connection) => {
      if (now.getTime() - connection.lastPing.getTime() > staleThreshold) {
        connection.isAlive = false;
        connection.ws.ping();
      }
    });
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    discussionsWithConnections: number;
    connectionsByDiscussion: Record<string, number>;
  } {
    const connectionsByDiscussion: Record<string, number> = {};
    let totalConnections = 0;

    for (const [discussionId, connections] of this.connections) {
      connectionsByDiscussion[discussionId] = connections.size;
      totalConnections += connections.size;
    }

    return {
      totalConnections,
      discussionsWithConnections: this.connections.size,
      connectionsByDiscussion,
    };
  }

  /**
   * Cleanup on shutdown
   */
  public async destroy(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all connections
    for (const connection of this.connectionById.values()) {
      connection.ws.close(1001, 'Server shutting down');
      // Remove session from Redis
      try {
        await this.redisSessionManager.removeSession(connection.connectionId);
      } catch (error) {
        logger.error('Failed to remove session during shutdown', {
          connectionId: connection.connectionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Clear all data structures
    this.connections.clear();
    this.connectionById.clear();

    // Close Redis connection
    await this.redisSessionManager.destroy();

    logger.info('WebSocket handler destroyed and cleaned up');
  }
}
