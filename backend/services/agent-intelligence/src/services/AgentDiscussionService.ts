import { logger } from '@uaip/utils';
import { EventBusService } from '@uaip/shared-services';

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
  private conversationCache: Map<string, DiscussionMessage[]> = new Map();

  constructor() {
    this.eventBusService = EventBusService.getInstance();
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
    let response = '';
    let confidence = 0.8;
    let type: 'direct' | 'clarification' | 'suggestion' | 'error' = 'direct';

    switch (strategy) {
      case 'informative':
        response = this.generateInformativeResponse(message, history);
        type = 'direct';
        break;
        
      case 'actionable':
        response = this.generateActionableResponse(message, history);
        type = 'direct';
        break;
        
      case 'friendly':
        response = this.generateFriendlyResponse(message, history, agentId);
        type = 'direct';
        break;
        
      case 'acknowledgment':
        response = this.generateAcknowledgmentResponse(message);
        type = 'direct';
        break;
        
      case 'corrective':
        response = this.generateCorrectiveResponse(message, history);
        type = 'clarification';
        confidence = 0.6;
        break;
        
      case 'explanatory':
        response = this.generateExplanatoryResponse(message, history);
        type = 'clarification';
        break;
        
      case 'contextual':
        response = this.generateContextualResponse(message, history);
        type = 'direct';
        break;
        
      default:
        response = this.generateConversationalResponse(message, history);
        type = 'suggestion';
        confidence = 0.7;
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
}