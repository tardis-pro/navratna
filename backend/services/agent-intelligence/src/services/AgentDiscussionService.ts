import { logger } from '@uaip/utils';
import { EventBusService, AgentService } from '@uaip/shared-services';

export interface DiscussionMessage {
  id: string;
  agentId: string;
  userId: string;
  conversationId: string;
  content: string;
  timestamp: Date;
  type: 'user' | 'agent' | 'system';
  metadata?: Record<string, unknown>;
}

export interface DiscussionResponse {
  response: string;
  metadata: {
    processingTime: number;
    confidence: number;
    conversationId: string;
    responseType: 'direct' | 'clarification' | 'suggestion' | 'error';
    context?: {
      previousMessages: number;
      userIntent: string;
      responseStrategy: string;
    };
  };
}

export class AgentDiscussionService {
  private eventBusService: EventBusService;
  private agentService: AgentService;
  private conversationCache: Map<string, DiscussionMessage[]> = new Map();
  private pendingDiscussionRequests: Map<string, {
    discussionId: string;
    agentId: string;
    participantId: string;
    discussionContext: any;
    agent: any;
    timestamp: Date;
  }> = new Map();

  constructor() {
    this.eventBusService = EventBusService.getInstance();
    this.agentService = AgentService.getInstance();
    this.setupLLMEventSubscriptions();
    this.setupDiscussionEventSubscriptions();
  }

  async processDiscussionMessage(params: {
    agentId: string;
    userId: string;
    message: string;
    conversationId: string;
    context?: Record<string, unknown>;
  }): Promise<DiscussionResponse> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing discussion message', { 
        agentId: params.agentId, 
        userId: params.userId, 
        conversationId: params.conversationId 
      });

      // Create message record
      const message: DiscussionMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        agentId: params.agentId,
        userId: params.userId,
        conversationId: params.conversationId,
        content: params.message,
        timestamp: new Date(),
        type: 'user',
        metadata: params.context
      };

      // Store message in conversation history
      await this.storeMessage(message);

      // Get conversation context
      const conversationHistory = this.getConversationHistory(params.conversationId);

      // Analyze user intent
      const userIntent = this.analyzeUserIntent(params.message, conversationHistory);

      // Determine response strategy
      const responseStrategy = this.determineResponseStrategy(userIntent, conversationHistory);

      // Generate fallback response (event-driven system doesn't use Promise-based responses)
      const response = this.generateFallbackResponse(
        params.message,
        userIntent,
        responseStrategy,
        conversationHistory,
        params.agentId
      );

      // Create agent response message
      const agentMessage: DiscussionMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        agentId: params.agentId,
        userId: params.userId,
        conversationId: params.conversationId,
        content: response.content,
        timestamp: new Date(),
        type: 'agent',
        metadata: {
          userIntent,
          responseStrategy,
          confidence: response.confidence
        }
      };

      // Store agent response
      await this.storeMessage(agentMessage);

      const processingTime = Date.now() - startTime;

      // Emit discussion event
      await this.eventBusService.publish('agent.discussion.message_processed', {
        agentId: params.agentId,
        userId: params.userId,
        conversationId: params.conversationId,
        userMessage: message,
        agentResponse: agentMessage,
        processingTime,
        timestamp: new Date()
      });

      const result: DiscussionResponse = {
        response: response.content,
        metadata: {
          processingTime,
          confidence: response.confidence,
          conversationId: params.conversationId,
          responseType: response.type,
          context: {
            previousMessages: conversationHistory.length,
            userIntent,
            responseStrategy
          }
        }
      };

      logger.info('Discussion message processed successfully', { 
        agentId: params.agentId, 
        processingTime,
        responseType: response.type 
      });

      return result;
    } catch (error) {
      logger.error('Failed to process discussion message', { 
        error, 
        agentId: params.agentId,
        conversationId: params.conversationId 
      });
      
      const processingTime = Date.now() - startTime;
      
      return {
        response: "I apologize, but I encountered an error processing your message. Please try again.",
        metadata: {
          processingTime,
          confidence: 0,
          conversationId: params.conversationId,
          responseType: 'error'
        }
      };
    }
  }

  private async storeMessage(message: DiscussionMessage): Promise<void> {
    // Store in cache
    const conversationMessages = this.conversationCache.get(message.conversationId) || [];
    conversationMessages.push(message);
    
    // Keep only last 50 messages per conversation
    if (conversationMessages.length > 50) {
      conversationMessages.shift();
    }
    
    this.conversationCache.set(message.conversationId, conversationMessages);
    
    logger.debug('Message stored', { 
      messageId: message.id, 
      conversationId: message.conversationId 
    });
  }

  private getConversationHistory(conversationId: string): DiscussionMessage[] {
    return this.conversationCache.get(conversationId) || [];
  }

  private analyzeUserIntent(message: string, history: DiscussionMessage[]): string {
    const lowerMessage = message.toLowerCase();
    
    // Question detection
    if (lowerMessage.includes('?') || lowerMessage.startsWith('what') || 
        lowerMessage.startsWith('how') || lowerMessage.startsWith('why') ||
        lowerMessage.startsWith('when') || lowerMessage.startsWith('where')) {
      return 'question';
    }
    
    // Request for action
    if (lowerMessage.includes('please') || lowerMessage.startsWith('can you') ||
        lowerMessage.startsWith('could you') || lowerMessage.includes('help me')) {
      return 'request';
    }
    
    // Greeting
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') ||
        lowerMessage.includes('good morning') || lowerMessage.includes('good afternoon')) {
      return 'greeting';
    }
    
    // Feedback
    if (lowerMessage.includes('thank') || lowerMessage.includes('good job') ||
        lowerMessage.includes('well done') || lowerMessage.includes('perfect')) {
      return 'positive_feedback';
    }
    
    if (lowerMessage.includes('wrong') || lowerMessage.includes('incorrect') ||
        lowerMessage.includes('not right') || lowerMessage.includes('error')) {
      return 'negative_feedback';
    }
    
    // Clarification
    if (lowerMessage.includes('clarify') || lowerMessage.includes('explain') ||
        lowerMessage.includes('what do you mean') || lowerMessage.includes('unclear')) {
      return 'clarification';
    }
    
    // Follow-up based on conversation history
    if (history.length > 0) {
      const lastMessage = history[history.length - 1];
      if (lastMessage.type === 'agent' && 
          (lowerMessage.includes('yes') || lowerMessage.includes('no') ||
           lowerMessage.includes('okay') || lowerMessage.includes('continue'))) {
        return 'follow_up';
      }
    }
    
    return 'general';
  }

  private determineResponseStrategy(intent: string, history: DiscussionMessage[]): string {
    switch (intent) {
      case 'question':
        return 'informative';
      case 'request':
        return 'actionable';
      case 'greeting':
        return 'friendly';
      case 'positive_feedback':
        return 'acknowledgment';
      case 'negative_feedback':
        return 'corrective';
      case 'clarification':
        return 'explanatory';
      case 'follow_up':
        return 'contextual';
      default:
        return 'conversational';
    }
  }




  private setupLLMEventSubscriptions(): void {
    // Subscribe to LLM generation responses
    this.eventBusService.subscribe('llm.agent.generate.response', async (event) => {
      const { requestId, content, error, confidence, model } = event.data;
      
      // Check if this is a discussion participation request
      const discussionRequest = this.pendingDiscussionRequests.get(requestId);
      if (discussionRequest) {
        await this.handleDiscussionParticipationResponse(requestId, content, error, confidence);
        return;
      }
      
      logger.warn('Received LLM response for unknown request', { requestId });
    });

    logger.info('LLM event subscriptions established');
  }

  private async handleDiscussionParticipationResponse(
    requestId: string,
    content: string,
    error: string,
    confidence: number
  ): Promise<void> {
    const discussionRequest = this.pendingDiscussionRequests.get(requestId);
    if (!discussionRequest) {
      logger.warn('Discussion request not found', { requestId });
      return;
    }

    this.pendingDiscussionRequests.delete(requestId);

    const { discussionId, participantId, agentId, discussionContext } = discussionRequest;

    if (error) {
      logger.warn('LLM generation failed for discussion participation, using fallback', {
        requestId,
        error,
        discussionId,
        agentId
      });
      
      // Send fallback message
      await this.sendFallbackParticipationMessage(discussionId, participantId, agentId, discussionContext);
      return;
    }

    // Send the generated message to the discussion
    await this.eventBusService.publish('discussion.agent.message', {
      discussionId,
      participantId,
      agentId,
      content: content || `Hello! I'm excited to join this discussion about ${discussionContext?.topic || 'this topic'}.`,
      messageType: 'message',
      metadata: {
        source: 'agent-intelligence',
        isInitialParticipation: true,
        confidence: confidence || 0.8,
        discussionTopic: discussionContext?.topic,
        timestamp: new Date()
      }
    });

    logger.info('Discussion participation message sent successfully', {
      requestId,
      discussionId,
      agentId,
      participantId,
      contentLength: content?.length
    });
  }

  private setupDiscussionEventSubscriptions(): void {
    // Subscribe to agent participation requests
    this.eventBusService.subscribe('agent.discussion.participate', async (event) => {
      const { discussionId, agentId, participantId, discussionContext } = event.data;
      
      try {
        logger.info('Received discussion participation request', {
          discussionId,
          agentId,
          participantId,
          discussionTitle: discussionContext?.title,
          eventSource: 'agent.discussion.participate',
          participantIdSource: 'from_event_data'
        });

        await this.handleDiscussionParticipation(discussionId, agentId, participantId, discussionContext);
      } catch (error) {
        logger.error('Error handling discussion participation request', {
          error: error instanceof Error ? error.message : 'Unknown error',
          discussionId,
          agentId,
          participantId
        });
      }
    });

    logger.info('Discussion event subscriptions established');
  }

  private generateQuickFallbackResponse(message: string, agentId: string): string {
    const responses = [
      `I'm Agent ${agentId}. I'm processing your message but experiencing some delays. Could you please try again?`,
      `Hello! I'm Agent ${agentId}. I'm having trouble generating a response right now. Please rephrase your question.`,
      `I'm Agent ${agentId} and I want to help, but I'm currently having some technical difficulties. Please try again.`
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private buildSystemPrompt(intent: string, strategy: string, agentId: string): string {
    return `You are Agent ${agentId}, a helpful and knowledgeable AI assistant. 

Current conversation context:
- User intent: ${intent}
- Response strategy: ${strategy}

Guidelines:
- Be helpful, accurate, and concise
- Adapt your tone based on the strategy (${strategy})
- If you don't know something, admit it honestly
- Keep responses under 200 words unless more detail is specifically requested
- Be conversational but professional

Remember: You are Agent ${agentId} and should respond in character as a capable AI assistant.`;
  }

  private generateFallbackResponse(
    message: string,
    intent: string,
    strategy: string,
    history: DiscussionMessage[],
    agentId: string
  ): {
    content: string;
    confidence: number;
    type: 'direct' | 'clarification' | 'suggestion' | 'error';
  } {
    // Fallback to template-based responses when LLM is unavailable
    let response = '';
    let confidence = 0.6; // Lower confidence for template responses
    let type: 'direct' | 'clarification' | 'suggestion' | 'error' = 'direct';

    switch (strategy) {
      case 'friendly':
        const isFirstInteraction = history.length <= 1;
        if (isFirstInteraction) {
          response = `Hello! I'm Agent ${agentId}. I'd be happy to help you, though I should mention that my LLM capabilities are currently limited. How can I assist you today?`;
        } else {
          response = "Hello again! I'm here to help, though my responses may be limited right now. What can I do for you?";
        }
        break;
      case 'informative':
        response = "I'd be happy to help answer your question. While my full capabilities aren't available right now, I'll do my best to assist you.";
        break;
      case 'actionable':
        response = "I understand you'd like help with something. Let me see what I can do to assist you with that request.";
        break;
      default:
        response = `I'm Agent ${agentId} and I'm here to help. My LLM capabilities are currently limited, but I'll do my best to assist you. Could you tell me more about what you need?`;
        type = 'suggestion';
    }

    return { content: response, confidence, type };
  }

  private generateInformativeResponse(message: string, history: DiscussionMessage[]): string {
    const responses = [
      "Based on your question, here's what I can tell you: I'm designed to help with various tasks and provide information. Could you be more specific about what you'd like to know?",
      "I'd be happy to help answer your question. To provide the most accurate information, could you give me a bit more context?",
      "That's an interesting question. Let me think about that and provide you with a comprehensive answer based on what I know."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private generateActionableResponse(message: string, history: DiscussionMessage[]): string {
    const responses = [
      "I understand you'd like me to help with something. Let me break this down into steps we can work through together.",
      "I'm ready to assist you with that request. Here's how we can approach this:",
      "Absolutely, I can help you with that. Let's start by clarifying exactly what you need."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private generateFriendlyResponse(message: string, history: DiscussionMessage[], agentId: string): string {
    const isFirstInteraction = history.length <= 1;
    
    if (isFirstInteraction) {
      return `Hello! I'm Agent ${agentId}. It's great to meet you! How can I assist you today?`;
    } else {
      const responses = [
        "Hello again! How can I help you today?",
        "Hi there! What can I do for you?",
        "Good to hear from you! What's on your mind?"
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }

  private generateAcknowledgmentResponse(message: string): string {
    const responses = [
      "Thank you for the positive feedback! I'm glad I could help.",
      "I appreciate your kind words. Is there anything else I can assist you with?",
      "That's wonderful to hear! I'm here whenever you need help."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private generateCorrectiveResponse(message: string, history: DiscussionMessage[]): string {
    const responses = [
      "I apologize for any confusion. Let me clarify and provide a better response.",
      "Thank you for pointing that out. You're right, let me correct that information.",
      "I appreciate the feedback. Let me provide a more accurate answer."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private generateExplanatoryResponse(message: string, history: DiscussionMessage[]): string {
    const responses = [
      "Let me explain that more clearly. What I meant was...",
      "I can see how that might be unclear. To clarify...",
      "Good question! Let me break that down for you..."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private generateContextualResponse(message: string, history: DiscussionMessage[]): string {
    const lastAgentMessage = history.slice().reverse().find(msg => msg.type === 'agent');
    
    if (lastAgentMessage) {
      return "Based on what we were discussing, I can continue helping you with that. What would you like to do next?";
    }
    
    return "I understand you're following up on something. Could you help me understand what you'd like to continue with?";
  }

  private generateConversationalResponse(message: string, history: DiscussionMessage[]): string {
    const responses = [
      "I understand what you're saying. How can I best help you with this?",
      "That's interesting. Tell me more about what you're thinking.",
      "I see. What would you like me to help you with regarding this?"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Utility methods for conversation management
  async getConversationSummary(conversationId: string): Promise<{
    messageCount: number;
    duration: number;
    mainTopics: string[];
    userSatisfaction?: number;
  }> {
    const messages = this.getConversationHistory(conversationId);
    
    if (messages.length === 0) {
      return {
        messageCount: 0,
        duration: 0,
        mainTopics: [],
        userSatisfaction: undefined
      };
    }

    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    const duration = lastMessage.timestamp.getTime() - firstMessage.timestamp.getTime();

    // Extract main topics (simplified)
    const topics = messages
      .filter(msg => msg.type === 'user')
      .map(msg => this.analyzeUserIntent(msg.content, []))
      .reduce((acc, intent) => {
        acc[intent] = (acc[intent] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const mainTopics = Object.entries(topics)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([topic]) => topic);

    return {
      messageCount: messages.length,
      duration,
      mainTopics,
      userSatisfaction: this.estimateUserSatisfaction(messages)
    };
  }

  private estimateUserSatisfaction(messages: DiscussionMessage[]): number {
    const userMessages = messages.filter(msg => msg.type === 'user');
    const positiveCount = userMessages.filter(msg => 
      this.analyzeUserIntent(msg.content, []) === 'positive_feedback'
    ).length;
    const negativeCount = userMessages.filter(msg => 
      this.analyzeUserIntent(msg.content, []) === 'negative_feedback'
    ).length;

    if (positiveCount === 0 && negativeCount === 0) {
      return 0.7; // Neutral default
    }

    const totalFeedback = positiveCount + negativeCount;
    return positiveCount / totalFeedback;
  }

  /**
   * Handle agent participation request from discussion orchestration
   */
  private async handleDiscussionParticipation(
    discussionId: string, 
    agentId: string, 
    participantId: string, 
    discussionContext: any
  ): Promise<void> {
    try {
      logger.info('Handling discussion participation', { 
        discussionId, 
        agentId, 
        participantId,
        topic: discussionContext?.topic,
        title: discussionContext?.title
      });

      // Get agent details
      const agent = await this.agentService.findAgentById(agentId);
      if (!agent) {
        logger.error('Agent not found for participation', { agentId, discussionId });
        return;
      }

      // Generate LLM request for participation message (event-driven)
      await this.requestParticipationMessage(agentId, discussionId, participantId, discussionContext, agent);

    } catch (error) {
      logger.error('Failed to handle discussion participation', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId, 
        agentId, 
        participantId 
      });
    }
  }

  private async requestParticipationMessage(
    agentId: string,
    discussionId: string,
    participantId: string,
    discussionContext: any,
    agent: any
  ): Promise<void> {
    try {
      const requestId = `discussion_${discussionId}_${agentId}_${Date.now()}`;
      
      // Store discussion context for when LLM responds
      this.pendingDiscussionRequests.set(requestId, {
        discussionId,
        agentId,
        participantId,
        discussionContext,
        agent,
        timestamp: new Date()
      });

      // Build context-aware system prompt
      const contextPrompt = this.buildDiscussionSystemPrompt(agent, discussionContext);
      const introMessage = this.buildDiscussionIntroMessage(agent, discussionContext);
      
      // Publish LLM generation request event
      await this.eventBusService.publish('llm.agent.generate.request', {
        requestId,
        agentId,
        messages: [{ role: 'user', content: introMessage }],
        systemPrompt: contextPrompt,
        maxTokens: agent.maxTokens || 500,
        temperature: agent.temperature || 0.7,
        model: agent.modelId || 'llama2',
        provider: agent.apiType || 'ollama',
        context: 'discussion_participation'
      });

      logger.info('Published LLM generation request for discussion participation', {
        requestId,
        discussionId,
        agentId,
        participantId
      });

    } catch (error) {
      logger.error('Failed to request participation message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId,
        agentId,
        participantId
      });
      
      // Send fallback message immediately
      await this.sendFallbackParticipationMessage(discussionId, participantId, agentId, discussionContext);
    }
  }

  private async sendFallbackParticipationMessage(
    discussionId: string,
    participantId: string,
    agentId: string,
    discussionContext: any
  ): Promise<void> {
    const fallbackMessage = `Hello! I'm Agent ${agentId} and I'm excited to join this discussion about ${discussionContext?.topic || 'this topic'}. I'm here to contribute and help with whatever we're working on.`;

    await this.eventBusService.publish('discussion.agent.message', {
      discussionId,
      participantId,
      agentId,
      content: fallbackMessage,
      messageType: 'message',
      metadata: {
        source: 'agent-intelligence',
        isInitialParticipation: true,
        confidence: 0.6,
        discussionTopic: discussionContext?.topic,
        timestamp: new Date(),
        fallback: true
      }
    });

    logger.info('Fallback participation message sent', {
      discussionId,
      participantId,
      agentId
    });
  }



  private buildDiscussionSystemPrompt(agent: any, discussionContext: any): string {
    const topic = discussionContext?.topic || 'general discussion';
    const title = discussionContext?.title || 'Untitled Discussion';
    const description = discussionContext?.description || '';
    
    return `You are ${agent.name}, joining a discussion titled "${title}" about ${topic}.

Discussion Context:
- Topic: ${topic}
- Description: ${description}
- Current phase: ${discussionContext?.phase || 'discussion'}
- Participants: ${discussionContext?.participantCount || 'multiple'} people

Your role:
- Be helpful and contribute meaningfully to the discussion
- Stay on topic about ${topic}
- Be professional but engaging
- Share relevant insights based on your capabilities

Introduce yourself briefly and show interest in the discussion topic.`;
  }

  private buildDiscussionIntroMessage(agent: any, discussionContext: any): string {
    const topic = discussionContext?.topic || 'this topic';
    return `I'm ${agent.name} and I'm joining this discussion about ${topic}. I'd like to contribute to our conversation.`;
  }

  private buildContextualFallbackMessage(agent: any, discussionContext: any): string {
    const topic = discussionContext?.topic;
    const title = discussionContext?.title;
    
    let message = `Hello! I'm ${agent.name}, and I'm excited to join this discussion`;
    
    if (title && title !== 'Untitled Discussion') {
      message += ` about "${title}"`;
    } else if (topic) {
      message += ` about ${topic}`;
    }
    
    message += `.`;
    
    if (agent.capabilities && agent.capabilities.length > 0) {
      const capabilities = agent.capabilities.slice(0, 2).join(' and ');
      message += ` I specialize in ${capabilities} and I'm here to contribute meaningfully to our conversation.`;
    } else {
      message += ` I'm here to contribute and help with whatever we're working on.`;
    }
    
    if (topic) {
      message += ` I'm particularly interested in discussing ${topic}. What aspects should we focus on?`;
    } else {
      message += ` What's the current focus of our discussion?`;
    }
    
    return message;
  }
}