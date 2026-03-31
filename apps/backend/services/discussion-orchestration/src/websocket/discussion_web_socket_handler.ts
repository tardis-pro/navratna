import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { config } from '../config/index.js';
import { DiscussionOrchestrationService } from '../services/discussion_orchestration_service.js';
import { DiscussionEvent } from '@uaip/types';
import {
  authenticateConnection,
  isValidUUID,
  generateSecureConnectionId,
} from './websocket_security_utils.js';
import { RedisSessionManager } from './redis_session_manager.js';
import type { WebSocketConnection, IWebSocketHandler } from '@uaip/types';

export { WebSocketConnection };

const WS_RATE_LIMITS = {
  MAX_CONNECTIONS_PER_USER: 5,
};

const WebSocketMessageSchema = z.object({
  type: z.string(),
  data: z.record(z.any()).optional(),
});

export class DiscussionWebSocketHandler implements IWebSocketHandler {
  private connections: Map<string, Set<WebSocketConnection>> = new Map();
  private connectionById: Map<string, WebSocketConnection> = new Map();
  private connectionTimers: Map<string, NodeJS.Timeout> = new Map();
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
      const existingTimer = this.connectionTimers.get(connection.connectionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.connectionTimers.delete(connection.connectionId);
      }

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

    this.resetConnectionTimer(connection);

    ws.on('message', (data) => {
      this.resetConnectionTimer(connection);
      this.handleMessage(connection, data);
    });

    ws.on('close', (code, reason) => {
      this.handleDisconnection(
        connection,
        typeof code === 'number' ? code : 1006,
        reason?.toString()
      );
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', {
        connectionId: connection.connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    ws.on('pong', () => {
      connection.isAlive = true;
      connection.lastPing = new Date();
      this.resetConnectionTimer(connection);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(connection: WebSocketConnection, data: unknown): Promise<void> {
    try {
      connection.lastActivity = new Date();
      connection.messageCount++;

      // Parse message
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
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
        case 'turn:request': {
          const participantId =
            typeof validatedMessage.data?.participantId === 'string'
              ? validatedMessage.data.participantId
              : connection.participantId;
          const rawScore = validatedMessage.data?.relevanceScore;
          const relevanceScore = typeof rawScore === 'number' ? rawScore : 0;

          if (!participantId) {
            this.sendError(connection.connectionId, 'participantId is required for turn requests');
            return;
          }

          const result = await this.orchestrationService.requestTurn(
            connection.discussionId,
            participantId,
            relevanceScore
          );

          this.sendToConnection(connection, {
            type: 'turn:request:ack',
            data: {
              success: result.success,
              discussionId: connection.discussionId,
              participantId,
              relevanceScore,
              ...result.data,
              error: result.error,
            },
          });
          break;
        }
        case 'context:update': {
          const context = validatedMessage.data?.context;
          if (!context || typeof context !== 'object' || Array.isArray(context)) {
            this.sendError(connection.connectionId, 'context:update requires a context object');
            return;
          }

          const result = await this.orchestrationService.updateWorkingMemoryContext(
            connection.discussionId,
            context as Record<string, unknown>,
            connection.participantId || connection.userId
          );

          this.sendToConnection(connection, {
            type: 'context:update:ack',
            data: {
              success: result.success,
              discussionId: connection.discussionId,
              error: result.error,
            },
          });
          break;
        }
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

    const timer = this.connectionTimers.get(connection.connectionId);
    if (timer) {
      clearTimeout(timer);
      this.connectionTimers.delete(connection.connectionId);
    }

    connection.ws.removeAllListeners();

    await this.removeConnectionAtomic(connection);
  }

  private resetConnectionTimer(connection: WebSocketConnection): void {
    const existingTimer = this.connectionTimers.get(connection.connectionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      if (!this.connectionById.has(connection.connectionId)) {
        this.connectionTimers.delete(connection.connectionId);
        return;
      }

      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.terminate();
      }

      this.connectionTimers.delete(connection.connectionId);
      void this.removeConnectionAtomic(connection);
    }, 120000);

    this.connectionTimers.set(connection.connectionId, timer);
  }

  /**
   * Send message to a specific connection
   */
  private sendToConnection(
    connection: WebSocketConnection,
    message: Record<string, unknown>
  ): void {
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
  public broadcastToDiscussion(discussionId: string, message: Record<string, unknown>): void {
    const connections = this.connections.get(discussionId);
    if (connections) {
      connections.forEach((connection) => {
        this.sendToConnection(connection, message);
      });
    }
  }

  public broadcastContextUpdate(discussionId: string, context: Record<string, unknown>): void {
    this.broadcastToDiscussion(discussionId, {
      type: 'context:updated',
      data: {
        context,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Heartbeat to keep connections alive
   */
  private heartbeat(): void {
    const now = new Date();
    const staleThreshold = config.discussionOrchestration.performance.wsHeartbeatStaleMs;

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
        // oxlint-disable-next-line no-await-in-loop -- sequential processing required
        await this.redisSessionManager.removeSession(connection.connectionId);
      } catch (error) {
        logger.error('Failed to remove session during shutdown', {
          connectionId: connection.connectionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Clear all data structures
    for (const timer of this.connectionTimers.values()) {
      clearTimeout(timer);
    }

    this.connectionTimers.clear();
    this.connections.clear();
    this.connectionById.clear();

    // Close Redis connection
    await this.redisSessionManager.destroy();

    logger.info('WebSocket handler destroyed and cleaned up');
  }
}
