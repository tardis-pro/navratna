import { Server, Socket } from 'socket.io';
import { EventBusService } from '@uaip/infra/event_bus';
import { createLogger } from '@uaip/utils';
import { validateJWTToken } from '@uaip/middleware';
import {
  ConversationIntelligenceEventType,
  ConversationWebSocketEventType,
  IntentDetectionCompletedEvent,
  TopicGenerationCompletedEvent,
  PromptSuggestionsCompletedEvent,
  AutocompleteSuggestionsReadyEvent,
} from '@uaip/types';
import { extractAccessTokenFromCookieHeader } from './websocket_security_utils.js';

interface ConversationIntelligenceConnection {
  userId: string;
  agentId: string;
  conversationId?: string;
  socketId: string;
  lastActivity: Date;
}

export class ConversationIntelligenceHandler {
  private io: Server;
  private eventBus: EventBusService;
  private connections: Map<string, ConversationIntelligenceConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>

  private logger = createLogger({
    serviceName: 'ConversationIntelligenceHandler',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  });

  constructor(io: Server, eventBus: EventBusService) {
    this.io = io;
    this.eventBus = eventBus;
    this.setupEventHandlers();
    this.subscribeToEventBus();
  }

  private setupEventHandlers() {
    // Create a namespace for conversation intelligence with proper error handling
    let ciNamespace;
    try {
      ciNamespace = this.io.of('/conversation_intelligence');
      if (!ciNamespace) {
        throw new Error('Failed to create conversation intelligence namespace');
      }
    } catch (error) {
      this.logger.error('Failed to create namespace:', error);
      throw new Error(
        'Namespace creation failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
        { cause: error }
      );
    }

    ciNamespace.on('connection', async (socket: Socket) => {
      try {
        this.logger.info('New conversation intelligence connection attempt', {
          socketId: socket.id,
          remoteAddress: socket.handshake?.address || 'unknown',
        });

        // Check for nginx-forwarded user headers first (preferred path)
        const nginxUserId = socket.handshake.headers['x-user-id'] as string | undefined;

        const nginxUserRole = socket.handshake.headers['x-user-role'] as string | undefined;

        let userId: string;

        if (nginxUserId) {
          // Validate userId is a proper UUID
          const UUID_REGEX =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (!UUID_REGEX.test(nginxUserId)) {
            this.logger.warn('Invalid nginx user ID format', { socketId: socket.id });
            socket.emit('error', { message: 'Authentication failed: Invalid user ID format' });
            socket.disconnect();
            return;
          }

          userId = nginxUserId;
          this.logger.info('Authenticated via nginx headers', {
            socketId: socket.id,
            userId: userId.substring(0, 8),
            role: nginxUserRole,
          });
        } else {
          // Fallback: Authenticate via token
          let token =
            typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';

          if (!token && typeof socket.handshake.query?.token === 'string') {
            token = socket.handshake.query.token;
          }

          if (!token) {
            token = extractAccessTokenFromCookieHeader(socket.handshake.headers.cookie) || '';
          }

          if (!token) {
            this.logger.warn('No authentication token provided', { socketId: socket.id });
            socket.emit('error', { message: 'Authentication failed: No token provided' });
            socket.disconnect();
            return;
          }

          this.logger.debug('Token received for validation', {
            socketId: socket.id,
            tokenLength: token.length,
          });

          let decoded;
          try {
            decoded = await validateJWTToken(token);
            this.logger.debug('Token validation result:', {
              valid: decoded.valid,
              userId: decoded.userId,
              reason: decoded.reason,
            });
          } catch (error) {
            this.logger.error('Token validation exception:', error);
            socket.emit('error', { message: 'Authentication failed: Token validation exception' });
            socket.disconnect();
            return;
          }

          if (!decoded || !decoded.valid || !decoded.userId) {
            this.logger.warn('Invalid token or missing userId', {
              valid: decoded?.valid,
              userId: decoded?.userId,
              reason: decoded?.reason,
            });
            socket.emit('error', {
              message: `Authentication failed: ${decoded?.reason || 'Invalid token'}`,
            });
            socket.disconnect();
            return;
          }

          userId = decoded.userId;
        }
        const agentId = socket.handshake.query.agentId as string;
        const conversationId = socket.handshake.query.conversationId as string;

        // Handle global user LLM provider
        const effectiveAgentId = agentId === 'global-user-llm' ? `user-${userId}` : agentId;

        // Store connection
        const connection: ConversationIntelligenceConnection = {
          userId,
          agentId: effectiveAgentId,
          conversationId,
          socketId: socket.id,
          lastActivity: new Date(),
        };

        this.connections.set(socket.id, connection);

        // Track user connections
        if (!this.userConnections.has(userId)) {
          this.userConnections.set(userId, new Set());
        }
        this.userConnections.get(userId)!.add(socket.id);

        // Join rooms
        socket.join(`user:${userId}`);
        socket.join(`agent:${effectiveAgentId}`);
        if (conversationId) {
          socket.join(`conversation:${conversationId}`);
        }

        this.logger.info('Conversation intelligence connection established', {
          userId,
          agentId: effectiveAgentId,
          originalAgentId: agentId,
          conversationId,
          socketId: socket.id,
        });

        // Set up socket event handlers
        socket.on('request_intent_detection', (data) =>
          this.handleIntentDetectionRequest(socket, data)
        );
        socket.on('request_topic_generation', (data) =>
          this.handleTopicGenerationRequest(socket, data)
        );
        socket.on('request_prompt_suggestions', (data) =>
          this.handlePromptSuggestionsRequest(socket, data)
        );
        socket.on('autocomplete_query', (data) => this.handleAutocompleteQuery(socket, data));
        socket.on('update_conversation', (data) => this.handleConversationUpdate(socket, data));
        socket.on('disconnect', () => this.handleDisconnect(socket));

        // Send connection success
        socket.emit('connected', {
          status: 'connected',
          features: ['intent_detection', 'topic_generation', 'prompt_suggestions', 'autocomplete'],
        });
      } catch (error) {
        this.logger.error('Failed to establish connection', error);
        socket.disconnect();
      }
    });
  }

  private subscribeToEventBus() {
    // Subscribe to intent detection completed events
    this.eventBus.subscribe(
      ConversationIntelligenceEventType.INTENT_DETECTION_COMPLETED,
      this.handleIntentDetectionCompleted.bind(this)
    );

    // Subscribe to topic generation completed events
    this.eventBus.subscribe(
      ConversationIntelligenceEventType.TOPIC_GENERATION_COMPLETED,
      this.handleTopicGenerationCompleted.bind(this)
    );

    // Subscribe to prompt suggestions completed events
    this.eventBus.subscribe(
      ConversationIntelligenceEventType.PROMPT_SUGGESTIONS_COMPLETED,
      this.handlePromptSuggestionsCompleted.bind(this)
    );

    // Subscribe to autocomplete suggestions ready events
    this.eventBus.subscribe(
      ConversationIntelligenceEventType.AUTOCOMPLETE_SUGGESTIONS_READY,
      this.handleAutocompleteSuggestionsReady.bind(this)
    );
  }

  private async handleIntentDetectionRequest(
    socket: Socket,
    data: { text: string; conversationId?: string; context?: Record<string, unknown> }
  ) {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    try {
      const requestData = data;
      // Publish event to event bus
      await this.eventBus.publish(ConversationIntelligenceEventType.INTENT_DETECTION_REQUESTED, {
        type: ConversationIntelligenceEventType.INTENT_DETECTION_REQUESTED,
        data: {
          userId: connection.userId,
          agentId: connection.agentId,
          conversationId: connection.conversationId || requestData.conversationId,
          text: requestData.text,
          context: requestData.context,
        },
      });

      // Send acknowledgment
      socket.emit('intent_detection_requested', { status: 'processing' });
    } catch (error) {
      this.logger.error('Failed to request intent detection', error);
      socket.emit('error', { error: 'Failed to process intent detection request' });
    }
  }

  private async handleTopicGenerationRequest(
    socket: Socket,
    data: { conversationId?: string; messages?: Record<string, unknown>[]; currentTopic?: string }
  ) {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    try {
      const requestData = data;
      await this.eventBus.publish(ConversationIntelligenceEventType.TOPIC_GENERATION_REQUESTED, {
        type: ConversationIntelligenceEventType.TOPIC_GENERATION_REQUESTED,
        data: {
          conversationId: connection.conversationId || requestData.conversationId,
          messages: requestData.messages,
          currentTopic: requestData.currentTopic,
        },
      });

      socket.emit('topic_generation_requested', { status: 'processing' });
    } catch (error) {
      this.logger.error('Failed to request topic generation', error);
      socket.emit('error', { error: 'Failed to process topic generation request' });
    }
  }

  private async handlePromptSuggestionsRequest(
    socket: Socket,
    data: { conversationContext?: Record<string, unknown>; count?: number }
  ) {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    try {
      const requestData = data;
      await this.eventBus.publish(ConversationIntelligenceEventType.PROMPT_SUGGESTIONS_REQUESTED, {
        type: ConversationIntelligenceEventType.PROMPT_SUGGESTIONS_REQUESTED,
        data: {
          userId: connection.userId,
          agentId: connection.agentId,
          conversationContext: requestData.conversationContext,
          count: requestData.count || 3,
        },
      });

      socket.emit('prompt_suggestions_requested', { status: 'processing' });
    } catch (error) {
      this.logger.error('Failed to request prompt suggestions', error);
      socket.emit('error', { error: 'Failed to process prompt suggestions request' });
    }
  }

  private async handleAutocompleteQuery(
    socket: Socket,
    data: { partial: string; context?: Record<string, unknown>; limit?: number } | null
  ) {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    try {
      if (!connection.agentId) {
        this.logger.warn('Autocomplete query missing agent context', {
          socketId: socket.id,
          userId: connection.userId,
        });
        socket.emit('error', { error: 'Autocomplete requires an agent context' });
        return;
      }

      const requestData = data;
      if (!requestData || typeof requestData.partial !== 'string') {
        this.logger.warn('Autocomplete query missing partial input', {
          socketId: socket.id,
          userId: connection.userId,
          agentId: connection.agentId,
        });
        socket.emit('error', { error: 'Autocomplete requires a partial input string' });
        return;
      }

      // Enhanced context for global user LLM requests
      const isGlobalUserLLM = connection.agentId.startsWith('user-');
      const contextData = requestData.context as Record<string, unknown> | undefined;
      const enhancedContext = {
        ...contextData,
        isGlobalUserLLM,
        userId: connection.userId,
        useDefaultLLMProvider: isGlobalUserLLM,
        requestType: contextData?.type || 'autocomplete',
      };

      await this.eventBus.publish(ConversationIntelligenceEventType.AUTOCOMPLETE_QUERY_REQUESTED, {
        type: ConversationIntelligenceEventType.AUTOCOMPLETE_QUERY_REQUESTED,
        data: {
          userId: connection.userId,
          agentId: connection.agentId,
          partial: requestData.partial,
          context: enhancedContext,
          limit: requestData.limit || 5,
        },
      });
    } catch (error) {
      this.logger.error('Failed to process autocomplete query', error);
      socket.emit('error', { error: 'Failed to process autocomplete query' });
    }
  }

  private handleConversationUpdate(
    socket: Socket,
    data: { conversationId?: string; agentId?: string }
  ) {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    const updateData = data;

    // Update conversation ID if provided
    if (updateData.conversationId && updateData.conversationId !== connection.conversationId) {
      // Leave old conversation room
      if (connection.conversationId) {
        socket.leave(`conversation:${connection.conversationId}`);
      }

      // Join new conversation room
      socket.join(`conversation:${updateData.conversationId}`);
      connection.conversationId = updateData.conversationId;
    }

    // Update agent ID if provided
    if (updateData.agentId && updateData.agentId !== connection.agentId) {
      socket.leave(`agent:${connection.agentId}`);
      socket.join(`agent:${updateData.agentId}`);
      connection.agentId = updateData.agentId;
    }

    connection.lastActivity = new Date();

    socket.emit('conversation_updated', {
      conversationId: connection.conversationId,
      agentId: connection.agentId,
    });
  }

  // Event Bus Handlers

  private async handleIntentDetectionCompleted(event: IntentDetectionCompletedEvent) {
    const { userId, conversationId, intent, suggestions, toolPreview } = event.data;

    // Emit to specific user's connections
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.forEach((socketId) => {
        const socket = this.io.of('/conversation_intelligence').sockets.get(socketId);
        if (socket) {
          socket.emit(ConversationWebSocketEventType.INTENT_DETECTED, {
            intent,
            toolPreview,
          });

          // Also emit suggestions if available
          if (suggestions && suggestions.length > 0) {
            socket.emit(ConversationWebSocketEventType.SUGGESTIONS_UPDATED, {
              prompts: suggestions,
            });
          }
        }
      });
    }

    // Also emit to conversation room if available
    if (conversationId) {
      this.io
        .of('/conversation_intelligence')
        .to(`conversation:${conversationId}`)
        .emit(ConversationWebSocketEventType.INTENT_DETECTED, {
          intent,
          toolPreview,
        });
    }
  }

  private async handleTopicGenerationCompleted(event: TopicGenerationCompletedEvent) {
    const { conversationId, topicName, confidence } = event.data;

    // Emit to conversation room
    this.io
      .of('/conversation_intelligence')
      .to(`conversation:${conversationId}`)
      .emit(ConversationWebSocketEventType.TOPIC_GENERATED, {
        topicName,
        confidence,
      });
  }

  private async handlePromptSuggestionsCompleted(event: PromptSuggestionsCompletedEvent) {
    const { userId, agentId, suggestions } = event.data;

    // Emit to user's connections
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.forEach((socketId) => {
        const socket = this.io.of('/conversation_intelligence').sockets.get(socketId);
        if (socket) {
          const connection = this.connections.get(socketId);
          // Only send if the agent matches
          if (connection && connection.agentId === agentId) {
            socket.emit(ConversationWebSocketEventType.SUGGESTIONS_UPDATED, {
              prompts: suggestions,
            });
          }
        }
      });
    }
  }

  private async handleAutocompleteSuggestionsReady(event: AutocompleteSuggestionsReadyEvent) {
    const { userId, agentId, suggestions, queryTime } = event.data;

    // Emit to user's connections
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.forEach((socketId) => {
        const socket = this.io.of('/conversation_intelligence').sockets.get(socketId);
        if (socket) {
          const connection = this.connections.get(socketId);
          // Only send if the agent matches
          if (connection && connection.agentId === agentId) {
            socket.emit(ConversationWebSocketEventType.AUTOCOMPLETE_RESULTS, {
              suggestions,
              queryTime,
            });
          }
        }
      });
    }
  }

  private handleDisconnect(socket: Socket) {
    const connection = this.connections.get(socket.id);
    if (connection) {
      // Remove from user connections
      const userSockets = this.userConnections.get(connection.userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          this.userConnections.delete(connection.userId);
        }
      }

      // Remove connection
      this.connections.delete(socket.id);

      this.logger.info('Conversation intelligence connection closed', {
        userId: connection.userId,
        agentId: connection.agentId,
        socketId: socket.id,
      });
    }
  }

  // Utility method to emit tool preview
  public emitToolPreview(userId: string, agentId: string, toolPreview: Record<string, unknown>) {
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.forEach((socketId) => {
        const socket = this.io.of('/conversation_intelligence').sockets.get(socketId);
        if (socket) {
          const connection = this.connections.get(socketId);
          if (connection && connection.agentId === agentId) {
            socket.emit(ConversationWebSocketEventType.TOOL_PREVIEW, toolPreview);
          }
        }
      });
    }
  }

  // Cleanup method
  public cleanup() {
    this.connections.clear();
    this.userConnections.clear();
  }
}
