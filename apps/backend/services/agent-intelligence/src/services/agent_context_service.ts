/**
 * Agent Context Service
 * Handles context analysis and management for agents
 * Part of the refactored agent-intelligence microservices
 */

import {
  Agent,
  ContextAnalysis,
  ConversationContext,
  EnvironmentFactors,
  KnowledgeItem,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { EventBusService } from '@uaip/infra/event_bus';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge_graph_service.js';
import { LLMService } from '@uaip/llm-service';

interface LLMContextAnalysis {
  userIntent?: { primary?: string; confidence?: number };
  contextualFactors?: Record<string, unknown>;
  confidence?: number;
  recommendations?: string[];
}

interface ContextAnalysisBase {
  userIntent?: { primary?: string };
  relevantKnowledge?: unknown[];
  contextualFactors?: { conversationLength?: number };
}

export interface AgentContextConfig {
  eventBusService: EventBusService;
  knowledgeGraphService: KnowledgeGraphService;
  llmService: LLMService;
  serviceName: string;
  securityLevel: number;
}

export class AgentContextService {
  private eventBusService: EventBusService;
  private knowledgeGraphService: KnowledgeGraphService;
  private llmService: LLMService;
  private serviceName: string;
  private securityLevel: number;

  constructor(config: AgentContextConfig) {
    this.eventBusService = config.eventBusService;
    this.knowledgeGraphService = config.knowledgeGraphService;
    this.llmService = config.llmService;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;
  }

  async initialize(): Promise<void> {
    // Set up event subscriptions
    await this.setupEventSubscriptions();

    logger.info('Agent Context Service initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel,
    });
  }

  /**
   * Set up event bus subscriptions for context operations
   */
  private async setupEventSubscriptions(): Promise<void> {
    await this.eventBusService.subscribe(
      'agent.context.analyze',
      this.handleAnalyzeContext.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.context.update',
      this.handleUpdateContext.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.context.extract',
      this.handleExtractContext.bind(this)
    );

    logger.info('Agent Context Service event subscriptions configured');
  }

  /**
   * Analyze context for an agent
   */
  async analyzeContext(
    agentId: string,
    conversationContext: ConversationContext,
    userRequest: string,
    userId?: string
  ): Promise<ContextAnalysis> {
    try {
      logger.info('Analyzing context for agent', {
        agentId,
        userId,
        requestLength: userRequest.length,
      });

      // Get agent data through event bus
      const agent = await this.getAgentData(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Retrieve relevant knowledge
      const knowledge = await this.knowledgeGraphService.search({
        query: userRequest,
        filters: {
          agentId,
          userId: conversationContext.userId,
        },
        options: {
          limit: 10,
        },
        timestamp: Date.now(),
      });

      // Perform base analysis
      const baseAnalysis = {
        userIntent: this.analyzeUserIntent(userRequest),
        contextualFactors: this.extractContextualInformation(conversationContext),
        environmentFactors: this.analyzeEnvironmentFactors(conversationContext),
        relevantKnowledge: knowledge.items,
      };

      // Enhance with LLM if available
      const enhancedAnalysis = await this.performLLMContextAnalysis(
        userRequest,
        conversationContext,
        agent,
        userId
      );

      // Combine analyses
      const contextAnalysis: ContextAnalysis = {
        id: this.generateAnalysisId(),
        agentId,
        timestamp: new Date(),
        userIntent: enhancedAnalysis?.userIntent || baseAnalysis.userIntent,
        contextualFactors: {
          ...baseAnalysis.contextualFactors,
          ...enhancedAnalysis?.contextualFactors,
        },
        environmentFactors: baseAnalysis.environmentFactors,
        confidence: enhancedAnalysis?.confidence || this.calculateConfidence(baseAnalysis),
        recommendations: enhancedAnalysis?.recommendations || [],
        relevantKnowledge: baseAnalysis.relevantKnowledge,
        metadata: {
          llmEnhanced: !!enhancedAnalysis,
          analysisVersion: '2.0',
          service: this.serviceName,
        },
      };

      // Publish analysis completed event
      await this.publishContextEvent('agent.context.analyzed', {
        agentId,
        analysisId: contextAnalysis.id,
        confidence: contextAnalysis.confidence,
        timestamp: new Date().toISOString(),
      });

      this.auditLog('CONTEXT_ANALYZED', {
        agentId,
        analysisId: contextAnalysis.id,
        userId,
      });

      return contextAnalysis;
    } catch (error) {
      logger.error('Failed to analyze context', { error, agentId });
      throw error;
    }
  }

  /**
   * Extract contextual information from conversation
   */
  extractContextualInformation(conversationContext: ConversationContext): Record<string, unknown> {
    const contextInfo = {
      conversationLength: conversationContext.messages?.length || 0,
      currentTopic: this.extractCurrentTopic(conversationContext),
      previousTopics: this.extractPreviousTopics(conversationContext),
      userPreferences: conversationContext.userPreferences || {},
      temporalContext: {
        sessionDuration: this.calculateSessionDuration(conversationContext),
        lastInteraction: conversationContext.lastInteractionTime,
        interactionFrequency: this.calculateInteractionFrequency(conversationContext),
      },
      emotionalContext: this.analyzeEmotionalContext(conversationContext),
      taskContext: this.extractTaskContext(conversationContext),
    };

    return contextInfo;
  }

  /**
   * Analyze environment factors
   */
  analyzeEnvironmentFactors(conversationContext: ConversationContext): EnvironmentFactors {
    return {
      platform: conversationContext.platform || 'web',
      device: conversationContext.device || 'desktop',
      location: conversationContext.location || 'unknown',
      timeOfDay: this.getTimeOfDay(),
      dayOfWeek: this.getDayOfWeek(),
      timezone: conversationContext.timezone || 'UTC',
      language: conversationContext.language || 'en',
      networkQuality: conversationContext.networkQuality || 'good',
      securityLevel: this.securityLevel,
    };
  }

  /**
   * Perform LLM-enhanced context analysis
   */
  private async performLLMContextAnalysis(
    userRequest: string,
    conversationContext: ConversationContext,
    agent: Agent,
    _userId?: string
  ): Promise<LLMContextAnalysis | null> {
    try {
      const prompt = this.buildContextAnalysisPrompt(userRequest, conversationContext, agent);

      const llmResponse = await this.llmService.generateResponse({
        prompt,
        systemPrompt:
          'You are an expert context analyst. Analyze the user request and conversation context to determine intent, relevant factors, and recommendations.',
        temperature: 0.7,
        maxTokens: 1000,
      });

      return llmResponse as LLMContextAnalysis;
    } catch (error) {
      logger.warn('LLM context analysis failed, falling back to basic analysis', { error });
      return null;
    }
  }

  /**
   * Analyze user intent from request
   */
  private analyzeUserIntent(userRequest: string): Record<string, unknown> {
    // Basic intent analysis
    const intent = {
      primary: 'unknown',
      secondary: [] as string[],
      confidence: 0.5,
      keywords: this.extractKeywords(userRequest),
      sentiment: this.analyzeSentiment(userRequest),
    };

    // Pattern matching for common intents
    if (userRequest.match(/\b(help|assist|support)\b/i)) {
      intent.primary = 'assistance';
      intent.confidence = 0.8;
    } else if (userRequest.match(/\b(create|make|build|generate)\b/i)) {
      intent.primary = 'creation';
      intent.confidence = 0.8;
    } else if (userRequest.match(/\b(analyze|examine|review|check)\b/i)) {
      intent.primary = 'analysis';
      intent.confidence = 0.8;
    } else if (userRequest.match(/\b(find|search|look|get)\b/i)) {
      intent.primary = 'retrieval';
      intent.confidence = 0.8;
    }

    return intent;
  }

  /**
   * Event handlers
   */
  private async handleAnalyzeContext(event: Record<string, unknown>): Promise<void> {
    const requestId = event.requestId as string;
    const agentId = event.agentId as string;
    const conversationContext = event.conversationContext as ConversationContext;
    const userRequest = event.userRequest as string;
    const userId = event.userId as string | undefined;
    try {
      const analysis = await this.analyzeContext(agentId, conversationContext, userRequest, userId);
      await this.respondToRequest(requestId, { success: true, data: analysis });
    } catch (error) {
      await this.respondToRequest(requestId, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleUpdateContext(event: Record<string, unknown>): Promise<void> {
    const requestId = event.requestId as string;
    const rawContextUpdate = (event.contextUpdate ?? {}) as Record<string, unknown>;
    const knowledgeItemId = rawContextUpdate.knowledgeItemId as string | undefined;
    const contextUpdate = rawContextUpdate as unknown as Partial<KnowledgeItem>;
    try {
      if (knowledgeItemId) {
        await this.knowledgeGraphService.updateKnowledge(knowledgeItemId, contextUpdate);
      }
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      await this.respondToRequest(requestId, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleExtractContext(event: Record<string, unknown>): Promise<void> {
    const requestId = event.requestId as string;
    const conversationContext = event.conversationContext as ConversationContext;
    try {
      const contextInfo = this.extractContextualInformation(conversationContext);
      await this.respondToRequest(requestId, { success: true, data: contextInfo });
    } catch (error) {
      await this.respondToRequest(requestId, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Helper methods
   */
  private generateAnalysisId(): string {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getAgentData(_agentId: string): Promise<Agent | null> {
    // Request agent data through event bus
    // This would be implemented to communicate with Agent Core Service
    return null;
  }

  private buildContextAnalysisPrompt(
    userRequest: string,
    conversationContext: ConversationContext,
    agent: Agent
  ): string {
    return `
Analyze the following user request and conversation context:

User Request: "${userRequest}"

Conversation History:
${this.formatConversationHistory(conversationContext)}

Agent Information:
- Name: ${agent.name}
- Role: ${agent.role}
- Capabilities: ${agent.capabilities.join(', ')}

Please analyze:
1. The user's primary and secondary intents
2. Relevant contextual factors
3. Recommendations for the agent's response
4. Confidence level in the analysis
`;
  }

  private formatConversationHistory(context: ConversationContext): string {
    if (!context.messages || context.messages.length === 0) {
      return 'No previous conversation';
    }

    return context.messages
      .slice(-5) // Last 5 messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');
  }

  private extractCurrentTopic(_context: ConversationContext): string {
    // Extract from recent messages
    return 'general';
  }

  private extractPreviousTopics(_context: ConversationContext): string[] {
    // Extract from conversation history
    return [];
  }

  private calculateSessionDuration(context: ConversationContext): number {
    if (!context.startTime) return 0;
    return Date.now() - new Date(context.startTime).getTime();
  }

  private calculateInteractionFrequency(context: ConversationContext): number {
    if (!context.messages || context.messages.length < 2) return 0;
    const duration = this.calculateSessionDuration(context);
    return context.messages.length / (duration / 60000); // Messages per minute
  }

  private analyzeEmotionalContext(_context: ConversationContext): Record<string, unknown> {
    return {
      userMood: 'neutral',
      frustrationLevel: 0,
      satisfactionLevel: 0.5,
    };
  }

  private extractTaskContext(_context: ConversationContext): Record<string, unknown> {
    return {
      currentTask: null,
      completedTasks: [] as Record<string, unknown>[],
      pendingTasks: [] as Record<string, unknown>[],
    };
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3)
      .filter((word) => !['the', 'and', 'for', 'with', 'from'].includes(word));
  }

  private analyzeSentiment(text: string): string {
    // Basic sentiment analysis
    const positiveWords = ['good', 'great', 'excellent', 'happy', 'thanks'];
    const negativeWords = ['bad', 'poor', 'terrible', 'unhappy', 'problem'];

    const words = text.toLowerCase().split(/\W+/);
    const positiveCount = words.filter((w) => positiveWords.includes(w)).length;
    const negativeCount = words.filter((w) => negativeWords.includes(w)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  private calculateConfidence(analysis: ContextAnalysisBase): number {
    let confidence = 0.5;

    if (analysis.userIntent?.primary !== 'unknown') confidence += 0.2;
    if ((analysis.relevantKnowledge?.length ?? 0) > 0) confidence += 0.2;
    if ((analysis.contextualFactors?.conversationLength ?? 0) > 3) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  private getDayOfWeek(): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  }

  private async publishContextEvent(channel: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: this.serviceName,
        securityLevel: this.securityLevel,
      });
    } catch (error) {
      logger.error('Failed to publish context event', { channel, error });
    }
  }

  private async respondToRequest(
    requestId: string,
    response: Record<string, unknown>
  ): Promise<void> {
    await this.eventBusService.publish('agent.context.response', {
      requestId,
      ...response,
      timestamp: new Date().toISOString(),
    });
  }

  private auditLog(event: string, data: Record<string, unknown>): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true,
    });
  }
}
