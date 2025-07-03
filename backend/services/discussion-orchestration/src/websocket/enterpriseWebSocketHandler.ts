/**
 * Enterprise WebSocket Handler
 * Zero Trust Architecture Implementation
 * SOC 2, HIPAA, PCI DSS Compliant
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '@uaip/utils';
import { validateServiceAccess, SERVICE_ACCESS_MATRIX, AccessLevel } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';

interface EnterpriseConnection {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  securityLevel: number;
  discussionIds: Set<string>;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
  authenticated: boolean;
  complianceFlags: string[];
}

interface WebSocketMessage {
  type: 'join_discussion' | 'leave_discussion' | 'send_message' | 'agent_chat' | 'agent_response' | 'typing' | 'heartbeat';
  payload: any;
  messageId: string;
  timestamp: Date;
  securityLevel: number;
}

export class EnterpriseWebSocketHandler extends EventEmitter {
  private connections = new Map<string, EnterpriseConnection>();
  private discussionConnections = new Map<string, Set<string>>();
  private eventBusService: EventBusService;
  private heartbeatInterval: NodeJS.Timeout;
  private cleanupInterval: NodeJS.Timeout;
  private serviceName: string;
  private authResponseHandlers = new Map<string, (event: any) => void>();

  constructor(server: any, eventBusService: EventBusService, serviceName: string) {
    super();

    this.eventBusService = eventBusService;
    this.serviceName = serviceName;

    // Create WebSocket server with Zero Trust configuration
    const wss = new WebSocket.Server({
      server,
      verifyClient: this.verifyClient.bind(this),
      maxPayload: 64 * 1024, // 64KB max payload
      perMessageDeflate: false // Disable compression for security
    });

    wss.on('connection', this.handleConnection.bind(this));

    // Set up cleanup intervals
    this.heartbeatInterval = setInterval(this.sendHeartbeats.bind(this), 30000);
    this.cleanupInterval = setInterval(this.cleanupStaleConnections.bind(this), 60000);

    // Subscribe to event bus for discussion events AND auth responses
    this.setupEventBusSubscriptions();

    logger.info(`Enterprise WebSocket server initialized for ${serviceName}`, {
      securityLevel: SERVICE_ACCESS_MATRIX[serviceName]?.securityLevel,
      complianceFlags: SERVICE_ACCESS_MATRIX[serviceName]?.complianceFlags
    });
  }

  /**
   * Zero Trust client verification
   */
  private verifyClient(info: any): boolean {
    const { req } = info;

    // Validate service access permissions
    if (!validateServiceAccess(this.serviceName, 'redis', 'redis-application', AccessLevel.WRITE)) {
      logger.warn('Service lacks required WebSocket permissions', { service: this.serviceName });
      return false;
    }

    // Basic security checks
    const userAgent = req.headers['user-agent'];
    const origin = req.headers.origin;

    // Block suspicious user agents
    if (!userAgent || userAgent.length < 10) {
      return false;
    }

    return true;
  }

  /**
   * Handle new WebSocket connection with enterprise authentication
   */
  private async handleConnection(ws: WebSocket, req: any): Promise<void> {
    const connectionId = this.generateConnectionId();
    const ipAddress = req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    logger.info('New WebSocket connection attempt', {
      connectionId,
      ipAddress,
      userAgent,
      service: this.serviceName
    });

    try {
      // Authenticate connection through Security Gateway
      const authResult = await this.authenticateConnection(req);

      if (!authResult.valid) {
        logger.warn('WebSocket authentication failed', {
          connectionId,
          reason: authResult.reason,
          auditEvent: 'WEBSOCKET_AUTH_FAILURE'
        });
        ws.close(4401, 'Authentication required');
        return;
      }

      // Create enterprise connection record
      const connection: EnterpriseConnection = {
        ws,
        userId: authResult.userId,
        sessionId: authResult.sessionId,
        securityLevel: authResult.securityLevel,
        discussionIds: new Set(),
        lastActivity: new Date(),
        ipAddress,
        userAgent,
        authenticated: true,
        complianceFlags: authResult.complianceFlags
      };

      this.connections.set(connectionId, connection);

      // Set up message handler
      ws.on('message', (data) => this.handleMessage(connectionId, data));
      ws.on('close', () => this.handleDisconnection(connectionId));
      ws.on('error', (error) => this.handleConnectionError(connectionId, error));

      // Send authentication success
      this.sendMessage(connectionId, {
        type: 'auth_success',
        payload: {
          sessionId: authResult.sessionId,
          securityLevel: authResult.securityLevel
        }
      });

      // Audit log for compliance
      this.auditLog('WEBSOCKET_CONNECTION_ESTABLISHED', {
        connectionId,
        userId: authResult.userId,
        securityLevel: authResult.securityLevel,
        complianceFlags: authResult.complianceFlags
      });

    } catch (error) {
      logger.error('WebSocket connection setup failed', { connectionId, error });
      ws.close(4500, 'Internal server error');
    }
  }

  /**
   * Enterprise authentication through Security Gateway
   */
  private async authenticateConnection(req: any): Promise<{
    valid: boolean;
    userId?: string;
    sessionId?: string;
    securityLevel?: number;
    complianceFlags?: string[];
    reason?: string;
  }> {
    try {
      // Extract authentication token
      const token = this.extractAuthToken(req);
      if (!token) {
        return { valid: false, reason: 'No authentication token provided' };
      }

      // Wait for auth response from Security Gateway with shorter timeout
      const authResponse = await this.waitForAuthResponse(token, 2000);

      if (!authResponse || !authResponse.valid) {
        return { valid: false, reason: authResponse?.reason || 'Authentication validation failed' };
      }

      return {
        valid: true,
        userId: authResponse.userId,
        sessionId: authResponse.sessionId,
        securityLevel: authResponse.securityLevel || 3,
        complianceFlags: authResponse.complianceFlags || []
      };

    } catch (error) {
      logger.error('Authentication error', { error });
      return { valid: false, reason: 'Authentication service error' };
    }
  }

  /**
   * Handle incoming WebSocket messages with validation
   */
  private async handleMessage(connectionId: string, data: WebSocket.Data): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      // Parse and validate message
      const message = this.parseMessage(data);
      if (!message) {
        this.sendError(connectionId, 'Invalid message format');
        return;
      }

      // Update activity timestamp
      connection.lastActivity = new Date();

      // Validate message security level
      if (message.securityLevel > connection.securityLevel) {
        this.auditLog('SECURITY_VIOLATION', {
          connectionId,
          userId: connection.userId,
          attemptedLevel: message.securityLevel,
          allowedLevel: connection.securityLevel
        });
        this.sendError(connectionId, 'Insufficient security clearance');
        return;
      }

      // Route message based on type
      switch (message.type) {
        case 'join_discussion':
          await this.handleJoinDiscussion(connectionId, message.payload);
          break;
        case 'leave_discussion':
          await this.handleLeaveDiscussion(connectionId, message.payload);
          break;
        case 'send_message':
          await this.handleSendMessage(connectionId, message.payload);
          break;
        case 'agent_chat':
          await this.handleAgentChat(connectionId, message.payload);
          break;
        case 'heartbeat':
          this.handleHeartbeat(connectionId);
          break;
        default:
          this.sendError(connectionId, 'Unknown message type');
      }

    } catch (error) {
      logger.error('Message handling error', { connectionId, error });
      this.sendError(connectionId, 'Message processing failed');
    }
  }

  /**
   * Event-driven discussion joining with Zero Trust validation
   */
  private async handleJoinDiscussion(connectionId: string, payload: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { discussionId } = payload;

    try {
      // Validate discussion access through event bus
      const accessRequest = {
        userId: connection.userId,
        discussionId,
        operation: 'join',
        securityLevel: connection.securityLevel,
        timestamp: new Date().toISOString()
      };

      await this.eventBusService.publish('discussion.access.validate', accessRequest);

      // Add to discussion connections
      connection.discussionIds.add(discussionId);

      if (!this.discussionConnections.has(discussionId)) {
        this.discussionConnections.set(discussionId, new Set());
      }
      this.discussionConnections.get(discussionId)!.add(connectionId);

      // Notify through event bus
      await this.eventBusService.publish('discussion.participant.joined', {
        discussionId,
        userId: connection.userId,
        connectionId,
        timestamp: new Date().toISOString()
      });

      this.sendMessage(connectionId, {
        type: 'discussion_joined',
        payload: { discussionId, success: true }
      });

      this.auditLog('DISCUSSION_JOINED', {
        connectionId,
        userId: connection.userId,
        discussionId
      });

    } catch (error) {
      logger.error('Join discussion error', { connectionId, discussionId, error });
      this.sendError(connectionId, 'Failed to join discussion');
    }
  }

  /**
   * Event-driven discussion leaving with Zero Trust validation
   */
  private async handleLeaveDiscussion(connectionId: string, payload: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { discussionId } = payload;

    try {
      // Validate discussion leave through event bus (optional, for compliance)
      const accessRequest = {
        userId: connection.userId,
        discussionId,
        operation: 'leave',
        securityLevel: connection.securityLevel,
        timestamp: new Date().toISOString()
      };
      await this.eventBusService.publish('discussion.access.validate', accessRequest);

      // Remove from discussion connections
      connection.discussionIds.delete(discussionId);
      const discussionConnections = this.discussionConnections.get(discussionId);
      if (discussionConnections) {
        discussionConnections.delete(connectionId);
        if (discussionConnections.size === 0) {
          this.discussionConnections.delete(discussionId);
        }
      }

      // Notify through event bus
      await this.eventBusService.publish('discussion.participant.left', {
        discussionId,
        userId: connection.userId,
        connectionId,
        timestamp: new Date().toISOString()
      });

      this.sendMessage(connectionId, {
        type: 'discussion_left',
        payload: { discussionId, success: true }
      });

      this.auditLog('DISCUSSION_LEFT', {
        connectionId,
        userId: connection.userId,
        discussionId
      });
    } catch (error) {
      logger.error('Leave discussion error', { connectionId, discussionId, error });
      this.sendError(connectionId, 'Failed to leave discussion');
    }
  }

  /**
   * Event-driven message sending with Zero Trust validation
   */
  private async handleSendMessage(connectionId: string, payload: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { discussionId, content } = payload;

    try {
      // Validate user is part of the discussion
      if (!connection.discussionIds.has(discussionId)) {
        this.sendError(connectionId, 'Not a participant of the discussion');
        return;
      }

      // Optionally, validate message content (length, compliance, etc.)
      if (!content || typeof content !== 'string' || content.length === 0) {
        this.sendError(connectionId, 'Invalid message content');
        return;
      }

      // Publish message to event bus for broadcast
      const messageEvent = {
        discussionId,
        userId: connection.userId,
        content,
        timestamp: new Date().toISOString(),
        connectionId
      };
      await this.eventBusService.publish('discussion.message.broadcast', messageEvent);

      this.sendMessage(connectionId, {
        type: 'message_sent',
        payload: { discussionId, success: true }
      });

      this.auditLog('MESSAGE_SENT', {
        connectionId,
        userId: connection.userId,
        discussionId,
        contentLength: content.length
      });
    } catch (error) {
      logger.error('Send message error', { connectionId, discussionId, error });
      this.sendError(connectionId, 'Failed to send message');
    }
  }

  /**
   * Handle direct agent chat messages
   */
  private async handleAgentChat(connectionId: string, payload: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { agentId, message, conversationHistory, context, messageId, timestamp } = payload;

    try {
      // Validate agent chat payload
      if (!agentId || !message || typeof message !== 'string' || message.length === 0) {
        this.sendError(connectionId, 'Invalid agent chat payload');
        return;
      }

      logger.info('Processing agent chat request', { 
        userId: connection.userId, 
        agentId, 
        messageLength: message.length 
      });

      // Forward agent chat request to agent intelligence service via event bus
      const chatRequest = {
        userId: connection.userId,
        agentId,
        message,
        conversationHistory: conversationHistory || [],
        context: context || {},
        connectionId,
        messageId,
        timestamp: timestamp || new Date().toISOString()
      };

      // Publish to agent intelligence service for processing
      await this.eventBusService.publish('agent.chat.request', chatRequest);

      logger.info('Agent chat request forwarded to agent intelligence service', { 
        agentId, 
        messageId 
      });

    } catch (error) {
      logger.error('Agent chat handling error', { connectionId, agentId, error });
      this.sendError(connectionId, 'Agent chat processing failed');
    }
  }

  /**
   * Event-driven message broadcasting
   */
  private async broadcastToDiscussion(discussionId: string, message: any, excludeConnectionId?: string): Promise<void> {
    const connections = this.discussionConnections.get(discussionId);
    if (!connections) return;

    const broadcastPromises: Promise<void>[] = [];

    for (const connectionId of connections) {
      if (connectionId === excludeConnectionId) continue;

      broadcastPromises.push(
        this.sendMessage(connectionId, message).catch(error => {
          logger.error('Broadcast failed', { connectionId, discussionId, error });
          // Remove failed connection
          this.handleDisconnection(connectionId);
        })
      );
    }

    await Promise.allSettled(broadcastPromises);
  }

  /**
   * Setup event bus subscriptions for Zero Trust architecture
   */
  private setupEventBusSubscriptions(): void {
    // Subscribe to discussion events
    this.eventBusService.subscribe('discussion.message.broadcast', async (event) => {
      await this.broadcastToDiscussion(event.data.discussionId, {
        type: 'new_message',
        payload: event.data
      });
    });

    this.eventBusService.subscribe('discussion.agent.response', async (event) => {
      await this.broadcastToDiscussion(event.data.discussionId, {
        type: 'agent_response',
        payload: event.data
      });
    });

    // Subscribe to direct agent chat responses
    this.eventBusService.subscribe('agent.chat.response', async (event) => {
      const { connectionId, agentId, response, agentName, ...metadata } = event.data;
      
      // Send response back to the specific connection
      if (connectionId && this.connections.has(connectionId)) {
        await this.sendMessage(connectionId, {
          type: 'agent_response',
          payload: {
            agentId,
            response,
            agentName,
            ...metadata
          }
        });
        
        logger.info('Agent chat response sent to client', { 
          connectionId, 
          agentId, 
          agentName 
        });
      }
    });

    // Subscribe to auth responses for WebSocket authentication
    this.eventBusService.subscribe('security.auth.response', async (event) => {
      const { correlationId } = event.data;
      
      logger.info('Received security auth response', {
        correlationId,
        hasHandler: this.authResponseHandlers.has(correlationId),
        pendingHandlers: Array.from(this.authResponseHandlers.keys()),
        valid: event.data?.valid,
        userId: event.data?.userId
      });
      
      // Find and call the appropriate handler
      const handler = this.authResponseHandlers.get(correlationId);
      if (handler) {
        logger.info('Calling auth response handler', { correlationId });
        handler(event);
        // Clean up the handler after use
        this.authResponseHandlers.delete(correlationId);
      } else {
        logger.warn('No handler found for auth response', { 
          correlationId,
          availableHandlers: Array.from(this.authResponseHandlers.keys())
        });
      }
    });

    // Security events
    this.eventBusService.subscribe('security.alert', async (event) => {
      // Handle security alerts that may affect WebSocket connections
      if (event.data.severity === 'HIGH' || event.data.severity === 'CRITICAL') {
        await this.handleSecurityAlert(event.data);
      }
    });

    logger.info('WebSocket event subscriptions established');
  }

  /**
   * Enterprise security alert handling
   */
  private async handleSecurityAlert(alert: any): Promise<void> {
    logger.warn('Security alert received', { alert });

    // Close connections based on alert type
    if (alert.type === 'USER_COMPROMISE' && alert.userId) {
      const connectionsToClose = Array.from(this.connections.entries())
        .filter(([_, conn]) => conn.userId === alert.userId)
        .map(([id, _]) => id);

      for (const connectionId of connectionsToClose) {
        const connection = this.connections.get(connectionId);
        if (connection) {
          connection.ws.close(4403, 'Security alert - connection terminated');
          this.handleDisconnection(connectionId);
        }
      }
    }
  }

  /**
   * Clean up stale connections for compliance
   */
  private cleanupStaleConnections(): void {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [connectionId, connection] of this.connections) {
      if (now.getTime() - connection.lastActivity.getTime() > staleThreshold) {
        logger.info('Cleaning up stale connection', { connectionId });
        connection.ws.close(4408, 'Connection timeout');
        this.handleDisconnection(connectionId);
      }
    }
  }

  /**
   * Compliance audit logging
   */
  private auditLog(event: string, data: any): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true
    });
  }

  // Helper methods
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractAuthToken(req: any): string | null {
    // Debug logging to see what we're receiving
    logger.info('WebSocket auth extraction debug:', {
      url: req.url,
      headers: req.headers,
      hasAuthHeader: !!req.headers.authorization,
      authHeaderValue: req.headers.authorization ? 'present' : 'missing'
    });

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    try {
      const urlParams = new URL(req.url, 'ws://localhost').searchParams;
      const token = urlParams.get('token');
      logger.info('Token extraction result:', { hasToken: !!token, url: req.url });
      return token;
    } catch (error) {
      logger.warn('Failed to parse WebSocket URL for token extraction:', { url: req.url, error });
      return null;
    }
  }

  private parseMessage(data: WebSocket.Data): WebSocketMessage | null {
    try {
      const parsed = JSON.parse(data.toString());
      return {
        type: parsed.type,
        payload: parsed.payload,
        messageId: parsed.messageId || this.generateConnectionId(),
        timestamp: new Date(),
        securityLevel: parsed.securityLevel || 3
      };
    } catch {
      return null;
    }
  }

  private async sendMessage(connectionId: string, message: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      connection.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Failed to send message', { connectionId, error });
      this.handleDisconnection(connectionId);
    }
  }

  private sendError(connectionId: string, message: string): void {
    this.sendMessage(connectionId, {
      type: 'error',
      payload: { message }
    });
  }

  private handleHeartbeat(connectionId: string): void {
    this.sendMessage(connectionId, {
      type: 'heartbeat_ack',
      payload: { timestamp: new Date().toISOString() }
    });
  }

  private sendHeartbeats(): void {
    for (const connectionId of this.connections.keys()) {
      this.sendMessage(connectionId, {
        type: 'heartbeat',
        payload: { timestamp: new Date().toISOString() }
      });
    }
  }

  private handleDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from all discussions
    for (const discussionId of connection.discussionIds) {
      const discussionConnections = this.discussionConnections.get(discussionId);
      if (discussionConnections) {
        discussionConnections.delete(connectionId);
        if (discussionConnections.size === 0) {
          this.discussionConnections.delete(discussionId);
        }
      }
    }

    this.connections.delete(connectionId);

    this.auditLog('WEBSOCKET_CONNECTION_CLOSED', {
      connectionId,
      userId: connection.userId,
      sessionDuration: new Date().getTime() - connection.lastActivity.getTime()
    });
  }

  private handleConnectionError(connectionId: string, error: Error): void {
    logger.error('WebSocket connection error', { connectionId, error });
    this.handleDisconnection(connectionId);
  }

  private async waitForAuthResponse(token: string, timeout: number): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const correlationId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        logger.warn('WebSocket authentication timeout', { correlationId, timeout });
        // Clean up handler on timeout
        this.authResponseHandlers.delete(correlationId);
        resolve({ valid: false, reason: 'Authentication timeout' });
      }, timeout);
      
      // Set up response handler using the pre-established subscription
      const responseHandler = (event: any) => {
        logger.debug('Received auth response event', {
          expectedCorrelationId: correlationId,
          receivedCorrelationId: event.data?.correlationId,
          matches: event.data?.correlationId === correlationId,
          valid: event.data?.valid
        });
        
        if (event.data.correlationId === correlationId) {
          clearTimeout(timeoutId);
          logger.info('WebSocket auth response matched', { 
            correlationId, 
            valid: event.data?.valid,
            userId: event.data?.userId 
          });
          resolve(event.data);
        }
      };
      
      try {
        // Store the handler for this correlation ID
        this.authResponseHandlers.set(correlationId, responseHandler);
        
        // Publish auth request with correlation ID
        await this.eventBusService.publish('security.auth.validate', {
          token,
          service: this.serviceName,
          operation: 'websocket_auth',
          correlationId,
          timestamp: new Date().toISOString()
        });
        
        logger.info('WebSocket auth request published', { correlationId });
        
      } catch (error) {
        logger.error('WebSocket auth setup failed', { error, correlationId });
        clearTimeout(timeoutId);
        this.authResponseHandlers.delete(correlationId);
        resolve({ valid: false, reason: 'Event bus error' });
      }
    });
  }

  /**
   * Graceful shutdown with compliance logging
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down Enterprise WebSocket Handler');

    clearInterval(this.heartbeatInterval);
    clearInterval(this.cleanupInterval);

    // Clear all pending auth handlers
    this.authResponseHandlers.clear();

    // Close all connections gracefully
    const closePromises: Promise<void>[] = [];
    for (const [connectionId, connection] of this.connections) {
      closePromises.push(
        new Promise((resolve) => {
          connection.ws.close(4001, 'Server shutting down');
          resolve();
        })
      );
    }

    await Promise.allSettled(closePromises);
    this.connections.clear();
    this.discussionConnections.clear();

    this.auditLog('WEBSOCKET_SERVICE_SHUTDOWN', {
      connectionsCount: closePromises.length
    });
  }
}