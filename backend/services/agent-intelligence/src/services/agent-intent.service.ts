/**
 * Agent Intent Service
 * Handles user intent analysis and action recommendations for agents
 * Part of the refactored agent-intelligence microservices
 */

import { Agent, KnowledgeItem, Episode } from '@uaip/types';
import { logger } from '@uaip/utils';
import {
  DatabaseService,
  EventBusService,
  KnowledgeGraphService,
  AgentMemoryService
} from '@uaip/shared-services';
import { LLMService, UserLLMService, LLMRequest } from '@uaip/llm-service';

export interface AgentIntentConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  knowledgeGraphService?: KnowledgeGraphService;
  agentMemoryService?: AgentMemoryService;
  llmService: LLMService;
  userLLMService: UserLLMService;
  serviceName: string;
  securityLevel: number;
}

export interface IntentAnalysis {
  primary: string;
  secondary: string[];
  confidence: number;
  entities: string[];
  sentiment: string;
  complexity: string;
  urgency: string;
}

export interface ActionRecommendation {
  action: string;
  description: string;
  confidence: number;
  priority: number;
  parameters?: any;
  constraints?: string[];
}

export class AgentIntentService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private knowledgeGraphService?: KnowledgeGraphService;
  private agentMemoryService?: AgentMemoryService;
  private llmService: LLMService;
  private userLLMService: UserLLMService;
  private serviceName: string;
  private securityLevel: number;

  constructor(config: AgentIntentConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.knowledgeGraphService = config.knowledgeGraphService;
    this.agentMemoryService = config.agentMemoryService;
    this.llmService = config.llmService;
    this.userLLMService = config.userLLMService;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;
  }

  async initialize(): Promise<void> {
    // Set up event subscriptions
    await this.setupEventSubscriptions();

    logger.info('Agent Intent Service initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel
    });
  }

  /**
   * Set up event bus subscriptions for intent operations
   */
  private async setupEventSubscriptions(): Promise<void> {
    await this.eventBusService.subscribe('agent.intent.analyze', this.handleAnalyzeIntent.bind(this));
    await this.eventBusService.subscribe('agent.intent.recommend', this.handleGenerateRecommendations.bind(this));
    await this.eventBusService.subscribe('agent.intent.explain', this.handleGenerateExplanation.bind(this));
    await this.eventBusService.subscribe('agent.intent.confidence', this.handleCalculateConfidence.bind(this));

    logger.info('Agent Intent Service event subscriptions configured');
  }

  /**
   * Analyze user intent using LLM
   */
  async analyzeLLMUserIntent(
    userRequest: string,
    conversationContext: any,
    agent: Agent,
    userId?: string
  ): Promise<IntentAnalysis> {
    try {
      this.validateInput(userRequest, 'userRequest');

      logger.info('Analyzing user intent with LLM', {
        agentId: agent.id,
        requestLength: userRequest.length
      });

      const llmRequest: LLMRequest = {
        prompt: `Analyze the user's intent from this request: "${userRequest}"

Context: ${JSON.stringify(conversationContext, null, 2)}

Please identify:
1. Primary intent (create, analyze, modify, information, etc.)
2. Secondary intents
3. Confidence level (0-1)
4. Key entities mentioned
5. Sentiment (positive, negative, neutral)
6. Complexity level (low, medium, high)
7. Urgency level (low, normal, high)

Respond in JSON format.`,
        systemPrompt: `You are an expert at analyzing user intent. Provide structured analysis in JSON format with fields: primary, secondary, confidence, entities, sentiment, complexity, urgency.`,
        maxTokens: 200,
        temperature: 0.3
      };

      let response;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        response = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        // Fall back to global LLM service
        response = await this.llmService.generateResponse(llmRequest);
      }

      if (response.error) {
        logger.warn('LLM intent analysis failed, using fallback', { error: response.error });
        return this.analyzeUserIntent(userRequest);
      }

      try {
        const parsed = JSON.parse(response.content);
        const intentAnalysis: IntentAnalysis = {
          primary: parsed.primary || this.extractPrimaryIntent(userRequest),
          secondary: parsed.secondary || [],
          confidence: parsed.confidence || 0.7,
          entities: parsed.entities || this.extractEntities(userRequest),
          sentiment: parsed.sentiment || this.analyzeSentiment(userRequest),
          complexity: parsed.complexity || this.assessComplexity(userRequest),
          urgency: parsed.urgency || this.detectUrgency(userRequest)
        };

        // Publish intent analyzed event
        await this.publishIntentEvent('agent.intent.analyzed', {
          agentId: agent.id,
          primary: intentAnalysis.primary,
          confidence: intentAnalysis.confidence,
          complexity: intentAnalysis.complexity
        });

        this.auditLog('INTENT_ANALYZED', {
          agentId: agent.id,
          primary: intentAnalysis.primary,
          confidence: intentAnalysis.confidence
        });

        return intentAnalysis;
      } catch (parseError) {
        logger.warn('Failed to parse LLM intent analysis, using fallback', { parseError });
        return this.analyzeUserIntent(userRequest);
      }
    } catch (error) {
      logger.error('Failed to analyze user intent', { error, agentId: agent.id });
      return this.analyzeUserIntent(userRequest);
    }
  }

  /**
   * Generate enhanced action recommendations using LLM
   */
  async generateLLMEnhancedActionRecommendations(
    agent: Agent,
    contextAnalysis: any,
    intentAnalysis: IntentAnalysis,
    constraints: any,
    relevantKnowledge: KnowledgeItem[],
    similarEpisodes: Episode[],
    userId?: string
  ): Promise<ActionRecommendation[]> {
    try {
      logger.info('Generating LLM-enhanced action recommendations', {
        agentId: agent.id,
        intent: intentAnalysis.primary
      });

      const llmRequest: LLMRequest = {
        prompt: `Based on the following analysis, recommend specific actions:

Agent: ${agent.name} (${agent.description || 'AI Assistant'})
User Intent: ${intentAnalysis.primary} (confidence: ${intentAnalysis.confidence})
Context: ${JSON.stringify(contextAnalysis, null, 2)}
Available Knowledge: ${relevantKnowledge.length} items
Similar Episodes: ${similarEpisodes.length} episodes
Constraints: ${JSON.stringify(constraints, null, 2)}

Provide 3-5 actionable recommendations with:
- action: brief action name
- description: detailed description
- confidence: 0-1 confidence score
- priority: 1-5 priority level
- parameters: any required parameters
- constraints: any limitations

Respond in JSON array format.`,
        systemPrompt: `You are an expert at recommending actions for AI agents. Provide practical, actionable recommendations in JSON array format.`,
        maxTokens: 400,
        temperature: 0.4
      };

      let response;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        response = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        // Fall back to global LLM service
        response = await this.llmService.generateResponse(llmRequest);
      }

      if (response.error) {
        logger.warn('LLM action recommendations failed, using fallback', { error: response.error });
        return this.generateEnhancedActionRecommendations(
          agent, contextAnalysis, intentAnalysis, constraints, relevantKnowledge, similarEpisodes
        );
      }

      try {
        const parsed = JSON.parse(response.content);
        const recommendations = Array.isArray(parsed) ? parsed : [parsed];

        // Validate and normalize recommendations
        const validatedRecommendations = recommendations.map(rec => ({
          action: rec.action || 'unknown_action',
          description: rec.description || 'No description provided',
          confidence: Math.max(0, Math.min(1, rec.confidence || 0.5)),
          priority: Math.max(1, Math.min(5, rec.priority || 3)),
          parameters: rec.parameters || {},
          constraints: rec.constraints || []
        }));

        // Publish recommendations generated event
        await this.publishIntentEvent('agent.recommendations.generated', {
          agentId: agent.id,
          count: validatedRecommendations.length,
          averageConfidence: validatedRecommendations.reduce((sum, r) => sum + r.confidence, 0) / validatedRecommendations.length
        });

        return validatedRecommendations;
      } catch (parseError) {
        logger.warn('Failed to parse LLM action recommendations, using fallback', { parseError });
        return this.generateEnhancedActionRecommendations(
          agent, contextAnalysis, intentAnalysis, constraints, relevantKnowledge, similarEpisodes
        );
      }
    } catch (error) {
      logger.error('Failed to generate action recommendations', { error, agentId: agent.id });
      return this.generateEnhancedActionRecommendations(
        agent, contextAnalysis, intentAnalysis, constraints, relevantKnowledge, similarEpisodes
      );
    }
  }

  /**
   * Generate enhanced explanation using LLM
   */
  async generateLLMEnhancedExplanation(
    contextAnalysis: any,
    intentAnalysis: IntentAnalysis,
    actionRecommendations: ActionRecommendation[],
    confidence: number,
    relevantKnowledge: KnowledgeItem[],
    similarEpisodes: Episode[],
    agent: Agent,
    userId?: string
  ): Promise<string> {
    try {
      logger.info('Generating LLM-enhanced explanation', {
        agentId: agent.id,
        recommendationsCount: actionRecommendations.length
      });

      const llmRequest: LLMRequest = {
        prompt: `Generate a clear explanation for the user about my analysis and recommendations:

Intent Analysis: ${intentAnalysis.primary} (${Math.round(intentAnalysis.confidence * 100)}% confidence)
Context: ${JSON.stringify(contextAnalysis, null, 2)}
Recommendations: ${actionRecommendations.length} actions suggested
Knowledge Used: ${relevantKnowledge.length} relevant items
Similar Past Experiences: ${similarEpisodes.length} episodes
Overall Confidence: ${Math.round(confidence * 100)}%

Explain:
1. What I understood from their request
2. Why I'm confident in this understanding
3. What actions I recommend and why
4. How my knowledge and experience inform these recommendations

Keep it conversational and helpful, as if speaking directly to the user.`,
        systemPrompt: `You are ${agent.name || 'an AI assistant'} explaining your analysis to a user. Be clear, helpful, and conversational. Explain your reasoning in a way that builds trust and understanding.`,
        maxTokens: 300,
        temperature: 0.6
      };

      let response;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        response = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        // Fall back to global LLM service
        response = await this.llmService.generateResponse(llmRequest);
      }

      if (response.error) {
        logger.warn('LLM explanation generation failed, using fallback', { error: response.error });
        return this.generateEnhancedExplanation(
          contextAnalysis, intentAnalysis, actionRecommendations, confidence, relevantKnowledge, similarEpisodes
        );
      }

      return response.content || this.generateEnhancedExplanation(
        contextAnalysis, intentAnalysis, actionRecommendations, confidence, relevantKnowledge, similarEpisodes
      );
    } catch (error) {
      logger.error('Failed to generate explanation', { error, agentId: agent.id });
      return this.generateEnhancedExplanation(
        contextAnalysis, intentAnalysis, actionRecommendations, confidence, relevantKnowledge, similarEpisodes
      );
    }
  }

  /**
   * Calculate enhanced confidence score
   */
  calculateEnhancedConfidence(
    contextAnalysis: any,
    intentAnalysis: IntentAnalysis,
    actionRecommendations: ActionRecommendation[],
    intelligenceConfig: any,
    relevantKnowledge: KnowledgeItem[],
    workingMemory: any
  ): number {
    const baseConfidence = intentAnalysis.confidence;
    const contextQuality = Math.min((contextAnalysis.messageCount || 0) / 10, 1);
    const recommendationConfidence = actionRecommendations.length > 0
      ? actionRecommendations.reduce((sum, rec) => sum + rec.confidence, 0) / actionRecommendations.length
      : 0.5;

    // Knowledge enhancement factor
    const knowledgeBoost = Math.min(relevantKnowledge.length * 0.1, 0.3);

    // Memory enhancement factor
    const memoryBoost = workingMemory ? 0.1 : 0;

    // Complexity penalty
    const complexityPenalty = intentAnalysis.complexity === 'high' ? 0.1 : 0;

    const finalConfidence = Math.min(
      (baseConfidence + contextQuality + recommendationConfidence + knowledgeBoost + memoryBoost - complexityPenalty) / 3,
      1
    );

    return Math.max(0, finalConfidence);
  }

  /**
   * Event handlers
   */
  private async handleAnalyzeIntent(event: any): Promise<void> {
    const { requestId, userRequest, conversationContext, agent, userId } = event;
    try {
      const analysis = await this.analyzeLLMUserIntent(userRequest, conversationContext, agent, userId);
      await this.respondToRequest(requestId, { success: true, data: analysis });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleGenerateRecommendations(event: any): Promise<void> {
    const { requestId, agent, contextAnalysis, intentAnalysis, constraints, relevantKnowledge, similarEpisodes, userId } = event;
    try {
      const recommendations = await this.generateLLMEnhancedActionRecommendations(
        agent, contextAnalysis, intentAnalysis, constraints, relevantKnowledge, similarEpisodes, userId
      );
      await this.respondToRequest(requestId, { success: true, data: recommendations });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleGenerateExplanation(event: any): Promise<void> {
    const { requestId, contextAnalysis, intentAnalysis, actionRecommendations, confidence, relevantKnowledge, similarEpisodes, agent, userId } = event;
    try {
      const explanation = await this.generateLLMEnhancedExplanation(
        contextAnalysis, intentAnalysis, actionRecommendations, confidence, relevantKnowledge, similarEpisodes, agent, userId
      );
      await this.respondToRequest(requestId, { success: true, data: explanation });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleCalculateConfidence(event: any): Promise<void> {
    const { requestId, contextAnalysis, intentAnalysis, actionRecommendations, intelligenceConfig, relevantKnowledge, workingMemory } = event;
    try {
      const confidence = this.calculateEnhancedConfidence(
        contextAnalysis, intentAnalysis, actionRecommendations, intelligenceConfig, relevantKnowledge, workingMemory
      );
      await this.respondToRequest(requestId, { success: true, data: confidence });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  /**
   * Helper methods
   */
  private analyzeUserIntent(userRequest: string): IntentAnalysis {
    // Enhanced intent analysis with knowledge graph support
    const intent = this.extractPrimaryIntent(userRequest);
    return {
      primary: intent,
      secondary: [],
      confidence: this.calculateIntentConfidence(userRequest, intent),
      entities: this.extractEntities(userRequest),
      sentiment: this.analyzeSentiment(userRequest),
      complexity: this.assessComplexity(userRequest),
      urgency: this.detectUrgency(userRequest)
    };
  }

  private generateEnhancedActionRecommendations(
    agent: Agent,
    contextAnalysis: any,
    intentAnalysis: IntentAnalysis,
    constraints: any,
    relevantKnowledge: KnowledgeItem[],
    similarEpisodes: Episode[]
  ): ActionRecommendation[] {
    const recommendations: ActionRecommendation[] = [];

    // Base recommendations based on intent
    switch (intentAnalysis.primary) {
      case 'create':
        recommendations.push({
          action: 'generate_content',
          description: 'Generate new content based on user requirements',
          confidence: 0.8,
          priority: 1,
          parameters: { type: 'creation', context: contextAnalysis }
        });
        break;
      case 'analyze':
        recommendations.push({
          action: 'perform_analysis',
          description: 'Analyze the provided information or data',
          confidence: 0.8,
          priority: 1,
          parameters: { type: 'analysis', context: contextAnalysis }
        });
        break;
      case 'modify':
        recommendations.push({
          action: 'modify_content',
          description: 'Modify existing content or data',
          confidence: 0.7,
          priority: 1,
          parameters: { type: 'modification', context: contextAnalysis }
        });
        break;
      default:
        recommendations.push({
          action: 'provide_information',
          description: 'Provide relevant information to answer the query',
          confidence: 0.6,
          priority: 1,
          parameters: { type: 'information', context: contextAnalysis }
        });
    }

    // Add knowledge-based recommendations
    if (relevantKnowledge.length > 0) {
      recommendations.push({
        action: 'use_knowledge',
        description: `Utilize ${relevantKnowledge.length} relevant knowledge items`,
        confidence: 0.7,
        priority: 2,
        parameters: { knowledgeItems: relevantKnowledge.slice(0, 3) }
      });
    }

    // Add experience-based recommendations
    if (similarEpisodes.length > 0) {
      recommendations.push({
        action: 'apply_experience',
        description: `Apply insights from ${similarEpisodes.length} similar past experiences`,
        confidence: 0.6,
        priority: 3,
        parameters: { episodes: similarEpisodes.slice(0, 2) }
      });
    }

    return recommendations;
  }

  private generateEnhancedExplanation(
    contextAnalysis: any,
    intentAnalysis: IntentAnalysis,
    actionRecommendations: ActionRecommendation[],
    confidence: number,
    relevantKnowledge: KnowledgeItem[],
    similarEpisodes: Episode[]
  ): string {
    let explanation = `Based on the conversation context with ${contextAnalysis.messageCount || 0} messages and detected intent '${intentAnalysis.primary}', I recommend ${actionRecommendations.length} action(s).`;

    if (relevantKnowledge.length > 0) {
      explanation += ` I found ${relevantKnowledge.length} relevant knowledge items to inform my recommendations.`;
    }

    if (similarEpisodes.length > 0) {
      explanation += ` I can also draw from ${similarEpisodes.length} similar past experiences.`;
    }

    explanation += ` Confidence level: ${Math.round(confidence * 100)}%.`;

    if (intentAnalysis.complexity === 'high') {
      explanation += ' This appears to be a complex request that may require multiple steps.';
    }

    if (intentAnalysis.urgency === 'high') {
      explanation += ' I understand this is urgent and will prioritize accordingly.';
    }

    return explanation;
  }

  private extractPrimaryIntent(userRequest: string): string {
    const request = userRequest.toLowerCase();

    const intentPatterns = {
      create: /create|make|build|generate|develop|write|design|construct/i,
      analyze: /analyze|examine|check|review|assess|evaluate|study|investigate/i,
      modify: /change|update|modify|edit|fix|improve|enhance|adjust/i,
      delete: /delete|remove|destroy|clean|clear|eliminate/i,
      search: /find|search|look|locate|discover|get|fetch/i,
      explain: /explain|describe|tell|show|how|what|why|clarify/i
    };

    for (const [intent, pattern] of Object.entries(intentPatterns)) {
      if (pattern.test(request)) {
        return intent;
      }
    }

    return 'information';
  }

  private calculateIntentConfidence(userRequest: string, intent: string): number {
    // Simple confidence calculation based on keyword presence and clarity
    const request = userRequest.toLowerCase();
    const words = request.split(/\s+/);

    // Base confidence
    let confidence = 0.5;

    // Boost for clear intent keywords
    const intentKeywords = {
      create: ['create', 'make', 'build', 'generate'],
      analyze: ['analyze', 'examine', 'check', 'review'],
      modify: ['change', 'update', 'modify', 'edit'],
      delete: ['delete', 'remove', 'destroy'],
      search: ['find', 'search', 'look', 'get'],
      explain: ['explain', 'describe', 'tell', 'how']
    };

    const keywords = intentKeywords[intent] || [];
    const matchingKeywords = keywords.filter(keyword => request.includes(keyword));
    confidence += matchingKeywords.length * 0.1;

    // Boost for request length (more context usually means clearer intent)
    if (words.length > 5) confidence += 0.1;
    if (words.length > 10) confidence += 0.1;

    // Penalty for very short requests
    if (words.length < 3) confidence -= 0.2;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private extractEntities(userRequest: string): string[] {
    // Simple entity extraction - in a real implementation, this would use NLP
    const entities: string[] = [];
    const words = userRequest.split(/\s+/);

    // Look for capitalized words (potential proper nouns)
    words.forEach(word => {
      const cleaned = word.replace(/[^\w]/g, '');
      if (cleaned.length > 2 && cleaned[0] === cleaned[0].toUpperCase()) {
        entities.push(cleaned);
      }
    });

    // Look for common entity patterns
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const urlPattern = /https?:\/\/[^\s]+/g;
    const numberPattern = /\b\d+\b/g;

    const emails = userRequest.match(emailPattern) || [];
    const urls = userRequest.match(urlPattern) || [];
    const numbers = userRequest.match(numberPattern) || [];

    return [...entities, ...emails, ...urls, ...numbers].slice(0, 10); // Limit to 10 entities
  }

  private analyzeSentiment(userRequest: string): string {
    const request = userRequest.toLowerCase();

    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'like', 'happy', 'pleased'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'angry', 'frustrated', 'disappointed', 'sad'];

    const positiveCount = positiveWords.filter(word => request.includes(word)).length;
    const negativeCount = negativeWords.filter(word => request.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  private assessComplexity(userRequest: string): string {
    const words = userRequest.split(/\s+/);
    const sentences = userRequest.split(/[.!?]+/).filter(s => s.trim().length > 0);

    // Complex indicators
    const complexWords = ['analyze', 'integrate', 'synthesize', 'optimize', 'implement', 'configure', 'customize'];
    const hasComplexWords = complexWords.some(word => userRequest.toLowerCase().includes(word));

    if (words.length > 20 || sentences.length > 3 || hasComplexWords) {
      return 'high';
    } else if (words.length > 10 || sentences.length > 1) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private detectUrgency(userRequest: string): string {
    const request = userRequest.toLowerCase();
    const urgentWords = ['urgent', 'asap', 'immediately', 'quickly', 'fast', 'emergency', 'critical', 'now', 'right away'];

    const hasUrgentWords = urgentWords.some(word => request.includes(word));

    if (hasUrgentWords) return 'high';

    // Check for time-sensitive patterns
    const timePatterns = ['today', 'tonight', 'this morning', 'this afternoon', 'deadline', 'due'];
    const hasTimePatterns = timePatterns.some(pattern => request.includes(pattern));

    if (hasTimePatterns) return 'normal';

    return 'low';
  }

  private validateInput(value: string, paramName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Invalid ${paramName}: must be a non-empty string`);
    }
  }

  private async publishIntentEvent(channel: string, data: any): Promise<void> {
    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: this.serviceName,
        securityLevel: this.securityLevel,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to publish intent event', { channel, error });
    }
  }

  private async respondToRequest(requestId: string, response: any): Promise<void> {
    await this.eventBusService.publish('agent.intent.response', {
      requestId,
      ...response,
      timestamp: new Date().toISOString()
    });
  }

  private auditLog(event: string, data: any): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true
    });
  }
}
