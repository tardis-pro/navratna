import { Server, Socket } from 'socket.io';
import { EventBusService } from '@uaip/shared-services';
import { createLogger } from '@uaip/utils';
import { validateJWTToken } from '@uaip/middleware';
import {
  ConversationIntelligenceEventType,
  ConversationWebSocketEventType,
  IntentDetectionCompletedEvent,
  TopicGenerationCompletedEvent,
  PromptSuggestionsCompletedEvent,
  AutocompleteSuggestionsReadyEvent
} from '@uaip/types';

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
    logLevel: process.env.LOG_LEVEL || 'info'
  });

  constructor(io: Server, eventBus: EventBusService) {
    this.io = io;
    this.eventBus = eventBus;
    this.setupEventHandlers();
    this.subscribeToEventBus();
  }

  private setupEventHandlers() {
    // Create a namespace for conversation intelligence
    const ciNamespace = this.io.of('/conversation-intelligence');

    ciNamespace.on('connection', async (socket: Socket) => {
      try {
        // Authenticate the connection
        const token = socket.handshake.auth.token;
        const decoded = await validateJWTToken(token);
        
        if (!decoded || !decoded.userId) {
          socket.disconnect();
          return;
        }

        const userId = decoded.userId;
        const agentId = socket.handshake.query.agentId as string;
        const conversationId = socket.handshake.query.conversationId as string;

        // Store connection
        const connection: ConversationIntelligenceConnection = {
          userId,
          agentId,
          conversationId,
          socketId: socket.id,
          lastActivity: new Date()
        };

        this.connections.set(socket.id, connection);
        
        // Track user connections
        if (!this.userConnections.has(userId)) {
          this.userConnections.set(userId, new Set());
        }
        this.userConnections.get(userId)!.add(socket.id);

        // Join rooms
        socket.join(`user:${userId}`);
        socket.join(`agent:${agentId}`);
        if (conversationId) {
          socket.join(`conversation:${conversationId}`);
        }

        this.logger.info('Conversation intelligence connection established', {
          userId,
          agentId,
          conversationId,
          socketId: socket.id
        });

        // Set up socket event handlers
        socket.on('request_intent_detection', (data) => this.handleIntentDetectionRequest(socket, data));
        socket.on('request_topic_generation', (data) => this.handleTopicGenerationRequest(socket, data));
        socket.on('request_prompt_suggestions', (data) => this.handlePromptSuggestionsRequest(socket, data));
        socket.on('autocomplete_query', (data) => this.handleAutocompleteQuery(socket, data));
        socket.on('update_conversation', (data) => this.handleConversationUpdate(socket, data));
        socket.on('disconnect', () => this.handleDisconnect(socket));

        // Send connection success
        socket.emit('connected', {
          status: 'connected',
          features: ['intent_detection', 'topic_generation', 'prompt_suggestions', 'autocomplete']
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

  private async handleIntentDetectionRequest(socket: Socket, data: any) {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    try {
      // Publish event to event bus
      await this.eventBus.publish(ConversationIntelligenceEventType.INTENT_DETECTION_REQUESTED, {
        type: ConversationIntelligenceEventType.INTENT_DETECTION_REQUESTED,
        data: {
          userId: connection.userId,
          agentId: connection.agentId,
          conversationId: connection.conversationId || data.conversationId,
          text: data.text,
          context: data.context
        }
      });

      // Send acknowledgment
      socket.emit('intent_detection_requested', { status: 'processing' });

    } catch (error) {
      this.logger.error('Failed to request intent detection', error);
      socket.emit('error', { error: 'Failed to process intent detection request' });
    }
  }

  private async handleTopicGenerationRequest(socket: Socket, data: any) {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    try {
      await this.eventBus.publish(ConversationIntelligenceEventType.TOPIC_GENERATION_REQUESTED, {
        type: ConversationIntelligenceEventType.TOPIC_GENERATION_REQUESTED,
        data: {
          conversationId: connection.conversationId || data.conversationId,
          messages: data.messages,
          currentTopic: data.currentTopic
        }
      });

      socket.emit('topic_generation_requested', { status: 'processing' });

    } catch (error) {
      this.logger.error('Failed to request topic generation', error);
      socket.emit('error', { error: 'Failed to process topic generation request' });
    }
  }

  private async handlePromptSuggestionsRequest(socket: Socket, data: any) {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    try {
      await this.eventBus.publish(ConversationIntelligenceEventType.PROMPT_SUGGESTIONS_REQUESTED, {
        type: ConversationIntelligenceEventType.PROMPT_SUGGESTIONS_REQUESTED,
        data: {
          userId: connection.userId,
          agentId: connection.agentId,
          conversationContext: data.conversationContext,
          count: data.count || 3
        }
      });

      socket.emit('prompt_suggestions_requested', { status: 'processing' });

    } catch (error) {
      this.logger.error('Failed to request prompt suggestions', error);
      socket.emit('error', { error: 'Failed to process prompt suggestions request' });
    }
  }

  private async handleAutocompleteQuery(socket: Socket, data: any) {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    try {
      await this.eventBus.publish(ConversationIntelligenceEventType.AUTOCOMPLETE_QUERY_REQUESTED, {
        type: ConversationIntelligenceEventType.AUTOCOMPLETE_QUERY_REQUESTED,
        data: {
          userId: connection.userId,
          agentId: connection.agentId,
          partial: data.partial,
          context: data.context,
          limit: data.limit || 5
        }
      });

    } catch (error) {
      this.logger.error('Failed to process autocomplete query', error);
      socket.emit('error', { error: 'Failed to process autocomplete query' });
    }
  }

  private handleConversationUpdate(socket: Socket, data: any) {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    // Update conversation ID if provided
    if (data.conversationId && data.conversationId !== connection.conversationId) {
      // Leave old conversation room
      if (connection.conversationId) {
        socket.leave(`conversation:${connection.conversationId}`);
      }
      
      // Join new conversation room
      socket.join(`conversation:${data.conversationId}`);
      connection.conversationId = data.conversationId;
    }

    // Update agent ID if provided
    if (data.agentId && data.agentId !== connection.agentId) {
      socket.leave(`agent:${connection.agentId}`);
      socket.join(`agent:${data.agentId}`);
      connection.agentId = data.agentId;
    }

    connection.lastActivity = new Date();
    
    socket.emit('conversation_updated', {
      conversationId: connection.conversationId,
      agentId: connection.agentId
    });
  }

  // Event Bus Handlers

  private async handleIntentDetectionCompleted(event: IntentDetectionCompletedEvent) {
    const { userId, conversationId, agentId, intent, suggestions, toolPreview } = event.data;

    // Emit to specific user's connections
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        const socket = this.io.of('/conversation-intelligence').sockets.get(socketId);
        if (socket) {
          socket.emit(ConversationWebSocketEventType.INTENT_DETECTED, {
            intent,
            toolPreview
          });

          // Also emit suggestions if available
          if (suggestions && suggestions.length > 0) {
            socket.emit(ConversationWebSocketEventType.SUGGESTIONS_UPDATED, {
              prompts: suggestions
            });
          }
        }
      });
    }

    // Also emit to conversation room if available
    if (conversationId) {
      this.io.of('/conversation-intelligence')
        .to(`conversation:${conversationId}`)
        .emit(ConversationWebSocketEventType.INTENT_DETECTED, {
          intent,
          toolPreview
        });
    }
  }

  private async handleTopicGenerationCompleted(event: TopicGenerationCompletedEvent) {
    const { conversationId, topicName, confidence } = event.data;

    // Emit to conversation room
    this.io.of('/conversation-intelligence')
      .to(`conversation:${conversationId}`)
      .emit(ConversationWebSocketEventType.TOPIC_GENERATED, {
        topicName,
        confidence
      });
  }

  private async handlePromptSuggestionsCompleted(event: PromptSuggestionsCompletedEvent) {
    const { userId, agentId, suggestions } = event.data;

    // Emit to user's connections
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        const socket = this.io.of('/conversation-intelligence').sockets.get(socketId);
        if (socket) {
          const connection = this.connections.get(socketId);
          // Only send if the agent matches
          if (connection && connection.agentId === agentId) {
            socket.emit(ConversationWebSocketEventType.SUGGESTIONS_UPDATED, {
              prompts: suggestions
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
      userSockets.forEach(socketId => {
        const socket = this.io.of('/conversation-intelligence').sockets.get(socketId);
        if (socket) {
          const connection = this.connections.get(socketId);
          // Only send if the agent matches
          if (connection && connection.agentId === agentId) {
            socket.emit(ConversationWebSocketEventType.AUTOCOMPLETE_RESULTS, {
              suggestions,
              queryTime
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
        socketId: socket.id
      });
    }
  }

  // Utility method to emit tool preview
  public emitToolPreview(userId: string, agentId: string, toolPreview: any) {
    const userSockets = this.userConnections.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        const socket = this.io.of('/conversation-intelligence').sockets.get(socketId);
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