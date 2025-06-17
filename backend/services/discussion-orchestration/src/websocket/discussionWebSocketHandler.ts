import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '@uaip/utils';
import { DiscussionOrchestrationService } from '../services/discussionOrchestrationService.js';
import { DiscussionEvent } from '@uaip/types';

export interface WebSocketConnection {
  ws: WebSocket;
  discussionId: string;
  userId?: string;
   participantId?: number;
  isAlive: boolean;
  lastPing: Date;
}

export class DiscussionWebSocketHandler {
  private connections: Map<string, Set<WebSocketConnection>> = new Map();
  private orchestrationService: DiscussionOrchestrationService;
  private heartbeatInterval: NodeJS.Timeout;

  constructor(orchestrationService: DiscussionOrchestrationService) {
    this.orchestrationService = orchestrationService;
    
    // Start heartbeat to keep connections alive
    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, 30000); // Every 30 seconds

    // Subscribe to discussion events from the orchestration service
    this.subscribeToEvents();
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws: WebSocket, request: IncomingMessage): void {
    try {
      // Extract discussion ID from URL path
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const pathParts = url.pathname.split('/');
      const discussionId = pathParts[2]; // /discussions/{discussionId}/ws

      if (!discussionId) {
        logger.warn('WebSocket connection rejected: missing discussion ID');
        ws.close(1008, 'Missing discussion ID');
        return;
      }

      // Extract user info from query params or headers
      const userId = url.searchParams.get('userId') || request.headers['x-user-id'] as string;
      const participantId = url.searchParams.get('participantId');

      logger.info('New WebSocket connection', {
        discussionId,
        userId,
        participantId,
        remoteAddress: request.socket.remoteAddress
      });

      // Create connection object
      const connection: WebSocketConnection = {
        ws,
        discussionId,
        userId,
        participantId,
        isAlive: true,
        lastPing: new Date()
      };

      // Add to connections map
      if (!this.connections.has(discussionId)) {
        this.connections.set(discussionId, new Set());
      }
      this.connections.get(discussionId)!.add(connection);

      // Set up WebSocket event handlers
      this.setupWebSocketHandlers(connection);

      // Send initial connection confirmation
      this.sendToConnection(connection, {
        type: 'connection.established',
        data: {
          discussionId,
          connectionId: this.generateConnectionId(),
          timestamp: new Date()
        }
      });

      // Verify participant access
      this.verifyAndNotifyAccess(connection);

    } catch (error) {
      logger.error('Error handling WebSocket connection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url: request.url
      });
      ws.close(1011, 'Internal server error');
    }
  }

  /**
   * Set up WebSocket event handlers for a connection
   */
  private setupWebSocketHandlers(connection: WebSocketConnection): void {
    const { ws, discussionId } = connection;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleWebSocketMessage(connection, message);
      } catch (error) {
        logger.error('Error handling WebSocket message', {
          error: error instanceof Error ? error.message : 'Unknown error',
          discussionId
        });
        this.sendToConnection(connection, {
          type: 'error',
          data: { message: 'Invalid message format' }
        });
      }
    });

    ws.on('pong', () => {
      connection.isAlive = true;
      connection.lastPing = new Date();
    });

    ws.on('close', (code, reason) => {
      logger.info('WebSocket connection closed', {
        discussionId,
        code,
        reason: reason.toString(),
        userId: connection.userId
      });
      this.removeConnection(connection);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', {
        error: error.message,
        discussionId,
        userId: connection.userId
      });
      this.removeConnection(connection);
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleWebSocketMessage(connection: WebSocketConnection, message: any): Promise<void> {
    const { discussionId, userId, participantId } = connection;

    logger.debug('WebSocket message received', {
      type: message.type,
      discussionId,
      userId
    });

    switch (message.type) {
      case 'ping':
        this.sendToConnection(connection, { type: 'pong', data: { timestamp: new Date() } });
        break;

      case 'message.send':
        if (!participantId) {
          this.sendToConnection(connection, {
            type: 'error',
            data: { message: 'Participant ID required to send messages' }
          });
          return;
        }

        try {
          const result = await this.orchestrationService.sendMessage(
            discussionId,
            participantId,
            message.data.content,
            message.data.messageType,
            message.data.metadata
          );

          if (!result.success) {
            this.sendToConnection(connection, {
              type: 'error',
              data: { message: result.error }
            });
          }
        } catch (error) {
          this.sendToConnection(connection, {
            type: 'error',
            data: { message: 'Failed to send message' }
          });
        }
        break;

      case 'turn.request':
        if (!participantId) {
          this.sendToConnection(connection, {
            type: 'error',
            data: { message: 'Participant ID required to request turn' }
          });
          return;
        }

        try {
          const result = await this.orchestrationService.requestTurn(discussionId, participantId);
          this.sendToConnection(connection, {
            type: 'turn.request.response',
            data: result
          });
        } catch (error) {
          this.sendToConnection(connection, {
            type: 'error',
            data: { message: 'Failed to request turn' }
          });
        }
        break;

      case 'turn.end':
        if (!participantId) {
          this.sendToConnection(connection, {
            type: 'error',
            data: { message: 'Participant ID required to end turn' }
          });
          return;
        }

        try {
          const result = await this.orchestrationService.endTurn(discussionId, participantId);
          if (!result.success) {
            this.sendToConnection(connection, {
              type: 'error',
              data: { message: result.error }
            });
          }
        } catch (error) {
          this.sendToConnection(connection, {
            type: 'error',
            data: { message: 'Failed to end turn' }
          });
        }
        break;

      case 'reaction.add':
        if (!participantId) {
          this.sendToConnection(connection, {
            type: 'error',
            data: { message: 'Participant ID required to add reaction' }
          });
          return;
        }

        try {
          const result = await this.orchestrationService.addReaction(
            discussionId,
            message.data.messageId,
            participantId,
            message.data.emoji
          );

          if (!result.success) {
            this.sendToConnection(connection, {
              type: 'error',
              data: { message: result.error }
            });
          }
        } catch (error) {
          this.sendToConnection(connection, {
            type: 'error',
            data: { message: 'Failed to add reaction' }
          });
        }
        break;

      default:
        this.sendToConnection(connection, {
          type: 'error',
          data: { message: `Unknown message type: ${message.type}` }
        });
    }
  }

  /**
   * Verify participant access and notify
   */
  private async verifyAndNotifyAccess(connection: WebSocketConnection): Promise<void> {
    const { discussionId, userId } = connection;

    if (!userId) {
      this.sendToConnection(connection, {
        type: 'access.denied',
        data: { message: 'User ID required' }
      });
      connection.ws.close(1008, 'User ID required');
      return;
    }

    try {
      const hasAccess = await this.orchestrationService.verifyParticipantAccess(discussionId, userId);
      
      if (!hasAccess) {
        this.sendToConnection(connection, {
          type: 'access.denied',
          data: { message: 'Access denied to this discussion' }
        });
        connection.ws.close(1008, 'Access denied');
        return;
      }

      // Get participant info
      const participant = await this.orchestrationService.getParticipantByUserId(discussionId, userId);
      if (participant) {
        connection.participantId = participant.id;
      }

      this.sendToConnection(connection, {
        type: 'access.granted',
        data: {
          discussionId,
          participant: participant ? {
            id: participant.id,
            role: participant.role,
            isActive: participant.isActive
          } : null
        }
      });

    } catch (error) {
      logger.error('Error verifying participant access', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        userId
      });
      
      this.sendToConnection(connection, {
        type: 'error',
        data: { message: 'Failed to verify access' }
      });
    }
  }

  /**
   * Subscribe to discussion events from orchestration service
   */
  private subscribeToEvents(): void {
    // This would integrate with the event bus service
    // For now, we'll assume events are pushed to this handler
    logger.info('Subscribed to discussion events');
  }

  /**
   * Broadcast event to all connections for a discussion
   */
  broadcastToDiscussion(discussionId: string, event: DiscussionEvent): void {
    const connections = this.connections.get(discussionId);
    if (!connections) {
      return;
    }

    const message = {
      type: 'discussion.event',
      data: event
    };

    let sentCount = 0;
    for (const connection of connections) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          logger.error('Error sending event to WebSocket connection', {
            error: error instanceof Error ? error.message : 'Unknown error',
            discussionId,
            userId: connection.userId
          });
          this.removeConnection(connection);
        }
      } else {
        this.removeConnection(connection);
      }
    }

    logger.debug('Event broadcasted to discussion', {
      discussionId,
      eventType: event.type,
      connectionCount: sentCount
    });
  }

  /**
   * Send message to specific connection
   */
  private sendToConnection(connection: WebSocketConnection, message: any): void {
    if (connection.ws.readyState === WebSocket.OPEN) {
      try {
        connection.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error('Error sending message to WebSocket connection', {
          error: error instanceof Error ? error.message : 'Unknown error',
          discussionId: connection.discussionId,
          userId: connection.userId
        });
        this.removeConnection(connection);
      }
    }
  }

  /**
   * Remove connection from tracking
   */
  private removeConnection(connection: WebSocketConnection): void {
    const connections = this.connections.get(connection.discussionId);
    if (connections) {
      connections.delete(connection);
      if (connections.size === 0) {
        this.connections.delete(connection.discussionId);
      }
    }
  }

  /**
   * Heartbeat to keep connections alive
   */
  private heartbeat(): void {
    const now = new Date();
    const staleThreshold = 60000; // 1 minute

    for (const [discussionId, connections] of this.connections) {
      for (const connection of connections) {
        if (connection.ws.readyState === WebSocket.OPEN) {
          if (now.getTime() - connection.lastPing.getTime() > staleThreshold) {
            connection.isAlive = false;
            connection.ws.ping();
          }
        } else {
          this.removeConnection(connection);
        }
      }
    }
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      connectionsByDiscussion
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    logger.info('Cleaning up WebSocket handler');
    
    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    for (const [discussionId, connections] of this.connections) {
      for (const connection of connections) {
        if (connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.close(1001, 'Server shutting down');
        }
      }
    }

    this.connections.clear();
    logger.info('WebSocket handler cleanup completed');
  }
} 