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
  private pendingLLMRequests: Map<string, {
    resolve: (response: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
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

      // Generate response
      const response = await this.generateResponse(
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

  private async generateResponse(
    message: string,
    intent: string,
    strategy: string,
    history: DiscussionMessage[],
    agentId: string
  ): Promise<{
    content: string;
    confidence: number;
    type: 'direct' | 'clarification' | 'suggestion' | 'error';
  }> {
    try {
      // Use event-driven LLM request instead of direct service call
      const llmResponse = await this.requestLLMGeneration(message, intent, strategy, history, agentId);

      // Determine response type based on strategy
      let type: 'direct' | 'clarification' | 'suggestion' | 'error' = 'direct';
      switch (strategy) {
        case 'explanatory':
        case 'corrective':
          type = 'clarification';
          break;
        case 'acknowledgment':
        default:
          type = 'suggestion';
          break;
        case 'informative':
        case 'actionable':
        case 'friendly':
        case 'contextual':
          type = 'direct';
          break;
      }

      return {
        content: llmResponse.content,
        confidence: llmResponse.confidence || 0.9,
        type
      };

    } catch (error) {
      logger.error('Error with event-driven LLM request, falling back to template', { 
        agentId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return this.generateFallbackResponse(message, intent, strategy, history, agentId);
    }
  }

  private async requestLLMGeneration(
    message: string,
    intent: string,
    strategy: string,
    history: DiscussionMessage[],
    agentId: string
  ): Promise<{ content: string; confidence: number }> {
    return new Promise(async (resolve, reject) => {
      const requestId = `llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Set up timeout (10 seconds for LLM generation)
      const timeout = setTimeout(() => {
        this.pendingLLMRequests.delete(requestId);
        logger.warn('LLM generation timeout', { requestId, agentId });
        // Resolve with fallback instead of rejecting
        resolve({
          content: this.generateQuickFallbackResponse(message, agentId),
          confidence: 0.5
        });
      }, 10000);

      // Store the promise handlers
      this.pendingLLMRequests.set(requestId, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout
      });

      try {
        // Build conversation history for LLM context
        const messages = [
          ...history.slice(-9).map(msg => ({
            id: msg.id,
            content: msg.content,
            sender: msg.type === 'user' ? 'user' : 'assistant',
            timestamp: msg.timestamp.toISOString(),
            type: (msg.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant'
          })),
          {
            id: `msg_${Date.now()}`,
            content: message,
            sender: 'user',
            timestamp: new Date().toISOString(),
            type: 'user' as const
          }
        ];

        // Get agent configuration for model/provider settings
        const agent = await this.agentService.findAgentById(agentId);
        if (!agent) {
          throw new Error(`Agent ${agentId} not found`);
        }

        // Use agent's model/provider configuration
        const effectiveModel = agent.modelId || 'llama2';
        const effectiveProvider = agent.apiType || 'ollama';
        const effectiveMaxTokens = agent.maxTokens || 500;
        const effectiveTemperature = agent.temperature || 0.7;

        logger.info('Using agent configuration for LLM request', {
          agentId,
          effectiveModel,
          effectiveProvider,
          effectiveMaxTokens,
          effectiveTemperature
        });

        // Publish LLM generation request via event bus
        await this.eventBusService.publish('llm.agent.generate.request', {
          requestId,
          agentId,
          messages,
          systemPrompt: this.buildSystemPrompt(intent, strategy, agentId),
          maxTokens: effectiveMaxTokens,
          temperature: effectiveTemperature,
          model: effectiveModel,
          provider: effectiveProvider
        });

        logger.debug('LLM generation request published', { requestId, agentId });

      } catch (error) {
        clearTimeout(timeout);
        this.pendingLLMRequests.delete(requestId);
        reject(error);
      }
    });
  }

  private setupLLMEventSubscriptions(): void {
    // Subscribe to LLM generation responses
    this.eventBusService.subscribe('llm.agent.generate.response', async (event) => {
      const { requestId, content, error, confidence, model } = event.data;
      
      const pendingRequest = this.pendingLLMRequests.get(requestId);
      if (!pendingRequest) {
        logger.warn('Received LLM response for unknown request', { requestId });
        return;
      }

      this.pendingLLMRequests.delete(requestId);

      if (error) {
        logger.warn('LLM generation failed', { requestId, error });
        // Resolve with fallback instead of rejecting
        pendingRequest.resolve({
          content: 'I apologize, but I encountered an issue generating my response. Please try again.',
          confidence: 0.3
        });
      } else {
        logger.debug('LLM generation successful', { requestId, model, contentLength: content?.length });
        pendingRequest.resolve({
          content: content || 'I apologize, but I received an empty response. Please try again.',
          confidence: confidence || 0.9
        });
      }
    });

    logger.info('LLM event subscriptions established');
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
          discussionTitle: discussionContext?.title
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

      // Generate context-aware participation message
      const participationMessage = await this.generateContextualParticipationMessage(
        agentId, 
        discussionId, 
        discussionContext
      );

      // Send the message to the discussion via event bus
      await this.eventBusService.publish('discussion.agent.message', {
        discussionId,
        participantId,
        agentId,
        content: participationMessage.content,
        messageType: 'message',
        metadata: {
          source: 'agent-intelligence',
          isInitialParticipation: true,
          confidence: participationMessage.confidence,
          discussionTopic: discussionContext?.topic,
          timestamp: new Date()
        }
      });

      logger.info('Agent participation message sent successfully', { 
        discussionId, 
        agentId, 
        participantId,
        contentLength: participationMessage.content.length
      });

    } catch (error) {
      logger.error('Failed to handle discussion participation', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId, 
        agentId, 
        participantId 
      });
    }
  }

  /**
   * Trigger agent participation in a discussion when they join
   */
  async triggerAgentParticipation(discussionId: string, agentId: string, participantId: string): Promise<void> {
    try {
      logger.info('Triggering agent participation in discussion', { 
        discussionId, 
        agentId, 
        participantId 
      });

      // Get agent details
      const agent = await this.agentService.findAgentById(agentId);
      if (!agent) {
        logger.error('Agent not found for participation trigger', { agentId, discussionId });
        return;
      }

      // Generate initial participation message
      const participationMessage = await this.generateParticipationMessage(agentId, discussionId);

      // Send the message to the discussion via event bus
      await this.eventBusService.publish('discussion.agent.message', {
        discussionId,
        participantId,
        agentId,
        content: participationMessage.content,
        messageType: 'message',
        metadata: {
          source: 'agent-intelligence',
          isInitialParticipation: true,
          confidence: participationMessage.confidence,
          timestamp: new Date()
        }
      });

      logger.info('Agent participation triggered successfully', { 
        discussionId, 
        agentId, 
        participantId,
        contentLength: participationMessage.content.length
      });

    } catch (error) {
      logger.error('Failed to trigger agent participation', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId, 
        agentId, 
        participantId 
      });
    }
  }

  /**
   * Generate context-aware participation message for an agent joining a discussion
   */
  private async generateContextualParticipationMessage(
    agentId: string, 
    discussionId: string, 
    discussionContext: any
  ): Promise<{
    content: string;
    confidence: number;
  }> {
    try {
      // Get agent details for personalized introduction
      const agent = await this.agentService.findAgentById(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Build context-aware system prompt
      const contextPrompt = this.buildDiscussionSystemPrompt(agent, discussionContext);
      const introMessage = this.buildDiscussionIntroMessage(agent, discussionContext);
      
      // Try to use LLM for a sophisticated, context-aware introduction
      try {
        const llmResponse = await this.requestLLMGeneration(
          introMessage,
          'greeting',
          'friendly',
          [], // No previous messages for initial participation
          agentId
        );

        return {
          content: llmResponse.content,
          confidence: llmResponse.confidence
        };
      } catch (llmError) {
        logger.warn('LLM generation failed for contextual participation message, using fallback', { 
          agentId, 
          discussionId,
          error: llmError instanceof Error ? llmError.message : 'Unknown error'
        });

        // Fallback to template-based introduction with context
        const fallbackMessage = this.buildContextualFallbackMessage(agent, discussionContext);

        return {
          content: fallbackMessage,
          confidence: 0.7
        };
      }
    } catch (error) {
      logger.error('Error generating contextual participation message', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        agentId, 
        discussionId 
      });

      // Ultimate fallback
      return {
        content: `Hello! I'm Agent ${agentId} and I'm ready to participate in this discussion. How can I help?`,
        confidence: 0.5
      };
    }
  }

  /**
   * Generate initial participation message for an agent joining a discussion
   */
  private async generateParticipationMessage(agentId: string, discussionId: string): Promise<{
    content: string;
    confidence: number;
  }> {
    try {
      // Get agent details for personalized introduction
      const agent = await this.agentService.findAgentById(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Generate introductory message using LLM
      const introMessage = `Hello! I'm ${agent.name}, and I'm excited to join this discussion.`;
      
      // Try to use LLM for a more sophisticated introduction
      try {
        const llmResponse = await this.requestLLMGeneration(
          introMessage,
          'greeting',
          'friendly',
          [], // No previous messages for initial participation
          agentId
        );

        return {
          content: llmResponse.content,
          confidence: llmResponse.confidence
        };
      } catch (llmError) {
        logger.warn('LLM generation failed for participation message, using fallback', { 
          agentId, 
          discussionId,
          error: llmError instanceof Error ? llmError.message : 'Unknown error'
        });

        // Fallback to template-based introduction
        const capabilities = agent.capabilities ? ` I specialize in ${agent.capabilities.slice(0, 2).join(' and ')}.` : '';
        const fallbackMessage = `Hello! I'm ${agent.name}, and I'm excited to join this discussion.${capabilities} I'm here to contribute and help with whatever we're working on. What's the current topic?`;

        return {
          content: fallbackMessage,
          confidence: 0.7
        };
      }
    } catch (error) {
      logger.error('Error generating participation message', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        agentId, 
        discussionId 
      });

      // Ultimate fallback
      return {
        content: `Hello! I'm Agent ${agentId} and I'm ready to participate in this discussion. How can I help?`,
        confidence: 0.5
      };
    }
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