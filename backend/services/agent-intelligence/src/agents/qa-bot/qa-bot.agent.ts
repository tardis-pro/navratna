/**
 * Q&A Bot Agent
 * Enterprise knowledge-based question answering agent
 * Integrates with knowledge bases, documentation, and learning from interactions
 */

import { Agent, AgentRole, AgentCapability, ConversationContext } from '@uaip/types';
import { logger } from '@uaip/utils';
import { EventBusService, KnowledgeGraphService, QdrantService } from '@uaip/shared-services';
import { BaseAgent } from '../base-agent';

export interface QABotConfig {
  eventBusService: EventBusService;
  knowledgeGraphService: KnowledgeGraphService;
  vectorSearchService: QdrantService;
  knowledgeSources: {
    confluence?: boolean;
    documentation?: boolean;
    previousConversations?: boolean;
    externalAPIs?: string[];
  };
  responseSettings: {
    maxTokens: number;
    includeSourceCitations: boolean;
    confidenceThreshold: number;
    fallbackBehavior: 'admit_unknowns' | 'suggest_alternatives' | 'escalate';
  };
}

export class QABotAgent extends BaseAgent {
  private knowledgeGraphService: KnowledgeGraphService;
  private vectorSearchService: QdrantService;
  private knowledgeSources: QABotConfig['knowledgeSources'];
  private responseSettings: QABotConfig['responseSettings'];
  private conversationMemory: Map<string, ConversationContext> = new Map();

  constructor(config: QABotConfig) {
    super({
      id: 'qa-bot-agent',
      name: 'Q&A Assistant',
      description: 'Enterprise knowledge-based question answering assistant',
      role: AgentRole.ASSISTANT,
      capabilities: [
        AgentCapability.NATURAL_LANGUAGE_PROCESSING,
        AgentCapability.KNOWLEDGE_RETRIEVAL,
        AgentCapability.CONTEXT_AWARENESS,
        AgentCapability.LEARNING,
        AgentCapability.TOOL_EXECUTION,
      ],
      eventBusService: config.eventBusService,
      serviceName: 'qa-bot-agent',
    });

    this.knowledgeGraphService = config.knowledgeGraphService;
    this.vectorSearchService = config.vectorSearchService;
    this.knowledgeSources = config.knowledgeSources;
    this.responseSettings = config.responseSettings;
  }

  async initialize(): Promise<void> {
    await super.initialize();

    // Set up Q&A specific event subscriptions
    await this.eventBusService.subscribe('qa.question.ask', this.handleQuestion.bind(this));
    await this.eventBusService.subscribe('qa.feedback.received', this.handleFeedback.bind(this));
    await this.eventBusService.subscribe(
      'qa.knowledge.update',
      this.handleKnowledgeUpdate.bind(this)
    );

    logger.info('Q&A Bot Agent initialized', {
      agent: this.agent.name,
      knowledgeSources: this.knowledgeSources,
      responseSettings: this.responseSettings,
    });
  }

  /**
   * Process a user question
   */
  async processQuestion(
    question: string,
    context: ConversationContext,
    userId: string
  ): Promise<{
    answer: string;
    confidence: number;
    sources: Array<{ type: string; reference: string; relevance: number }>;
    suggestedFollowUps?: string[];
  }> {
    try {
      logger.info('Processing Q&A request', {
        questionLength: question.length,
        userId,
        contextId: context.contextId,
      });

      // Step 1: Analyze the question
      const questionAnalysis = await this.analyzeQuestion(question, context);

      // Step 2: Search for relevant information
      const searchResults = await this.searchKnowledge(questionAnalysis, context);

      // Step 3: Synthesize answer
      const answer = await this.synthesizeAnswer(
        question,
        questionAnalysis,
        searchResults,
        context
      );

      // Step 4: Generate follow-up suggestions
      const followUps = await this.generateFollowUpQuestions(question, answer.answer, context);

      // Step 5: Store interaction for learning
      await this.storeInteraction(question, answer, context, userId);

      // Step 6: Emit analytics event
      await this.emitAnalytics('qa.question.answered', {
        questionType: questionAnalysis.type,
        confidence: answer.confidence,
        sourcesUsed: answer.sources.length,
        responseTime: Date.now() - questionAnalysis.timestamp,
      });

      return {
        ...answer,
        suggestedFollowUps: followUps,
      };
    } catch (error) {
      logger.error('Failed to process Q&A request', { error, question });
      return this.handleQuestionError(question, error);
    }
  }

  /**
   * Analyze the question to understand intent and requirements
   */
  private async analyzeQuestion(
    question: string,
    context: ConversationContext
  ): Promise<{
    type: 'factual' | 'procedural' | 'conceptual' | 'troubleshooting' | 'opinion';
    entities: string[];
    intent: string;
    complexity: 'simple' | 'moderate' | 'complex';
    timestamp: number;
    requiresTools: boolean;
    suggestedSources: string[];
  }> {
    // Extract entities and keywords
    const entities = await this.extractEntities(question);

    // Determine question type
    const type = this.classifyQuestionType(question);

    // Analyze complexity
    const complexity = this.assessComplexity(question, entities);

    // Determine if tools are needed
    const requiresTools = this.checkToolRequirement(question, type);

    // Suggest appropriate knowledge sources
    const suggestedSources = this.suggestKnowledgeSources(type, entities);

    return {
      type,
      entities,
      intent: this.extractIntent(question),
      complexity,
      timestamp: Date.now(),
      requiresTools,
      suggestedSources,
    };
  }

  /**
   * Search across configured knowledge sources
   */
  private async searchKnowledge(
    analysis: any,
    context: ConversationContext
  ): Promise<{
    knowledgeGraphResults: any[];
    vectorSearchResults: any[];
    confluenceResults?: any[];
    conversationResults?: any[];
  }> {
    const searchPromises = [];

    // Search knowledge graph
    searchPromises.push(
      this.knowledgeGraphService.search({
        query: analysis.intent,
        filters: {
          confidence: 0.7,
        },
        options: {
          limit: 10,
        },
        timestamp: Date.now(),
      })
    );

    // Vector similarity search - temporarily disabled until embedding service is available
    searchPromises.push(Promise.resolve({ results: [] }));

    // Search Confluence if enabled
    if (this.knowledgeSources.confluence) {
      searchPromises.push(this.searchConfluence(analysis.intent, analysis.entities));
    }

    // Search previous conversations if enabled
    if (this.knowledgeSources.previousConversations) {
      searchPromises.push(this.searchConversations(analysis.intent, context));
    }

    const results = await Promise.allSettled(searchPromises);

    return {
      knowledgeGraphResults: results[0]?.status === 'fulfilled' ? results[0].value.items : [],
      vectorSearchResults: results[1]?.status === 'fulfilled' ? results[1].value.results : [],
      confluenceResults: results[2]?.status === 'fulfilled' ? results[2].value : [],
      conversationResults: results[3]?.status === 'fulfilled' ? results[3].value : [],
    };
  }

  /**
   * Synthesize answer from search results
   */
  private async synthesizeAnswer(
    question: string,
    analysis: any,
    searchResults: any,
    context: ConversationContext
  ): Promise<{
    answer: string;
    confidence: number;
    sources: Array<{ type: string; reference: string; relevance: number }>;
  }> {
    // Rank and filter relevant information
    const relevantInfo = this.rankAndFilterResults(searchResults, analysis);

    // Check if we have enough information
    if (relevantInfo.length === 0) {
      return this.generateNoAnswerResponse(question, analysis);
    }

    // Generate answer using LLM with retrieved context
    const answerResponse = await this.generateLLMAnswer(question, relevantInfo, context);

    // Extract sources
    const sources = this.extractSources(relevantInfo);

    // Calculate confidence
    const confidence = this.calculateAnswerConfidence(answerResponse, relevantInfo, analysis);

    return {
      answer: answerResponse.text,
      confidence,
      sources,
    };
  }

  /**
   * Generate follow-up question suggestions
   */
  private async generateFollowUpQuestions(
    originalQuestion: string,
    answer: string,
    context: ConversationContext
  ): Promise<string[]> {
    try {
      const prompt = `
Based on this Q&A exchange, suggest 3 relevant follow-up questions:

Question: ${originalQuestion}
Answer: ${answer}

Generate questions that:
1. Dive deeper into the topic
2. Explore related aspects
3. Clarify any ambiguities
`;

      const response = await this.callLLM(prompt, {
        temperature: 0.8,
        maxTokens: 200,
      });

      return this.parseFollowUpQuestions(response.text);
    } catch (error) {
      logger.warn('Failed to generate follow-up questions', { error });
      return [];
    }
  }

  /**
   * Handle user feedback on answers
   */
  private async handleFeedback(event: {
    questionId: string;
    feedback: 'helpful' | 'not_helpful' | 'partially_helpful';
    additionalComments?: string;
    userId: string;
  }): Promise<void> {
    try {
      // Store feedback for learning
      await this.knowledgeGraphService.addFeedback({
        entityId: event.questionId,
        feedbackType: event.feedback,
        comments: event.additionalComments,
        userId: event.userId,
        timestamp: new Date(),
      });

      // Adjust confidence scores based on feedback
      if (event.feedback === 'not_helpful') {
        await this.adjustKnowledgeConfidence(event.questionId, -0.1);
      } else if (event.feedback === 'helpful') {
        await this.adjustKnowledgeConfidence(event.questionId, 0.05);
      }

      // Learn from negative feedback
      if (event.feedback !== 'helpful' && event.additionalComments) {
        await this.learnFromFeedback(event);
      }

      this.auditLog('QA_FEEDBACK_RECEIVED', {
        questionId: event.questionId,
        feedback: event.feedback,
        userId: event.userId,
      });
    } catch (error) {
      logger.error('Failed to process feedback', { error, event });
    }
  }

  /**
   * Search Confluence for relevant documentation
   */
  private async searchConfluence(query: string, entities: string[]): Promise<any[]> {
    try {
      const searchRequest = {
        query,
        filters: {
          space: ['TECH', 'DOCS', 'KB'], // Relevant Confluence spaces
          type: ['page', 'blogpost'],
          labels: entities,
        },
        limit: 5,
      };

      // Request Confluence search through tool execution
      const response = await this.executeTool('confluence_search', searchRequest);

      return response.results || [];
    } catch (error) {
      logger.warn('Confluence search failed', { error });
      return [];
    }
  }

  /**
   * Helper methods
   */
  private classifyQuestionType(question: string): any {
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('how do') || lowerQuestion.includes('how to')) {
      return 'procedural';
    } else if (lowerQuestion.includes('what is') || lowerQuestion.includes('what are')) {
      return 'conceptual';
    } else if (lowerQuestion.includes('why') || lowerQuestion.includes('when')) {
      return 'factual';
    } else if (
      lowerQuestion.includes('error') ||
      lowerQuestion.includes('issue') ||
      lowerQuestion.includes('problem')
    ) {
      return 'troubleshooting';
    }

    return 'factual';
  }

  private assessComplexity(
    question: string,
    entities: string[]
  ): 'simple' | 'moderate' | 'complex' {
    const wordCount = question.split(' ').length;
    const entityCount = entities.length;

    if (wordCount < 10 && entityCount <= 2) return 'simple';
    if (wordCount > 30 || entityCount > 5) return 'complex';
    return 'moderate';
  }

  private checkToolRequirement(question: string, type: string): boolean {
    // Troubleshooting often requires tool execution
    if (type === 'troubleshooting') return true;

    // Check for action-oriented keywords
    const actionKeywords = ['create', 'update', 'delete', 'modify', 'check', 'verify'];
    return actionKeywords.some((keyword) => question.toLowerCase().includes(keyword));
  }

  private suggestKnowledgeSources(type: string, entities: string[]): string[] {
    const sources = ['knowledge_graph', 'vector_search'];

    if (type === 'procedural' || type === 'troubleshooting') {
      sources.push('confluence');
    }

    if (
      entities.some((e) => e.toLowerCase().includes('previous') || e.toLowerCase().includes('last'))
    ) {
      sources.push('conversations');
    }

    return sources;
  }

  private async extractEntities(text: string): Promise<string[]> {
    // Simple entity extraction - in production, use NER
    const words = text.split(' ');
    const entities = words.filter(
      (word) =>
        word.length > 3 &&
        word[0] === word[0].toUpperCase() &&
        !['What', 'When', 'Where', 'Why', 'How', 'The'].includes(word)
    );

    return [...new Set(entities)];
  }

  private extractIntent(question: string): string {
    // Simplified intent extraction
    return question
      .toLowerCase()
      .replace(/[?.,!]/g, '')
      .replace(/\b(what|when|where|why|how|is|are|do|does|can|could|would|should)\b/g, '')
      .trim();
  }

  private rankAndFilterResults(searchResults: any, analysis: any): any[] {
    const allResults = [
      ...searchResults.knowledgeGraphResults,
      ...searchResults.vectorSearchResults,
      ...(searchResults.confluenceResults || []),
      ...(searchResults.conversationResults || []),
    ];

    // Score and rank results
    const scoredResults = allResults.map((result) => ({
      ...result,
      relevanceScore: this.calculateRelevance(result, analysis),
    }));

    // Filter by confidence threshold and sort by relevance
    return scoredResults
      .filter((r) => r.relevanceScore >= this.responseSettings.confidenceThreshold)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5); // Top 5 results
  }

  private calculateRelevance(result: any, analysis: any): number {
    let score = result.score || result.confidence || 0.5;

    // Boost score if entities match
    const matchedEntities = analysis.entities.filter((e: string) =>
      result.content?.toLowerCase().includes(e.toLowerCase())
    );
    score += matchedEntities.length * 0.1;

    // Boost score for matching question type
    if (result.metadata?.type === analysis.type) {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }

  private async generateLLMAnswer(
    question: string,
    relevantInfo: any[],
    context: ConversationContext
  ): Promise<{ text: string }> {
    const systemPrompt = `You are a helpful Q&A assistant. Answer questions accurately based on the provided context. 
If information is incomplete, acknowledge limitations. Always cite sources when available.`;

    const userPrompt = `
Question: ${question}

Relevant Context:
${relevantInfo
  .map(
    (info, idx) => `
[${idx + 1}] ${info.content}
Source: ${info.source || 'Knowledge Base'}
Confidence: ${info.relevanceScore}
`
  )
  .join('\n')}

Please provide a clear, accurate answer based on this context. If the context doesn't fully answer the question, acknowledge what's missing.
`;

    const response = await this.callLLM(userPrompt, {
      systemPrompt,
      temperature: 0.3,
      maxTokens: this.responseSettings.maxTokens,
    });

    return { text: response.text };
  }

  private extractSources(relevantInfo: any[]): any[] {
    return relevantInfo.map((info) => ({
      type: info.sourceType || 'knowledge_base',
      reference: info.source || info.id || 'Unknown',
      relevance: info.relevanceScore || 0.5,
    }));
  }

  private calculateAnswerConfidence(
    answerResponse: any,
    relevantInfo: any[],
    analysis: any
  ): number {
    let confidence = 0.5;

    // Factor in source quality
    const avgSourceScore =
      relevantInfo.reduce((sum, r) => sum + r.relevanceScore, 0) / relevantInfo.length;
    confidence = avgSourceScore;

    // Adjust based on number of sources
    if (relevantInfo.length >= 3) confidence += 0.1;
    if (relevantInfo.length === 1) confidence -= 0.1;

    // Adjust based on question complexity
    if (analysis.complexity === 'simple') confidence += 0.1;
    if (analysis.complexity === 'complex') confidence -= 0.1;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private generateNoAnswerResponse(question: string, analysis: any): any {
    let answer = "I don't have enough information to answer your question accurately.";

    switch (this.responseSettings.fallbackBehavior) {
      case 'admit_unknowns':
        answer += ' This topic might be outside my current knowledge base.';
        break;
      case 'suggest_alternatives':
        answer +=
          ' You might want to try rephrasing your question or asking about a related topic.';
        break;
      case 'escalate':
        answer += " I'm escalating this to a human expert who can provide better assistance.";
        this.escalateToHuman(question, analysis);
        break;
    }

    return {
      answer,
      confidence: 0.1,
      sources: [],
    };
  }

  private parseFollowUpQuestions(text: string): string[] {
    // Parse numbered list or bullet points
    const lines = text.split('\n').filter((line) => line.trim());
    const questions = lines
      .filter((line) => /^[\d\-\*•]/.test(line.trim()))
      .map((line) => line.replace(/^[\d\-\*•\.\)]\s*/, '').trim())
      .filter((q) => q.endsWith('?'));

    return questions.slice(0, 3);
  }

  private async storeInteraction(
    question: string,
    answer: any,
    context: ConversationContext,
    userId: string
  ): Promise<void> {
    const interaction = {
      id: `qa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      question,
      answer: answer.answer,
      confidence: answer.confidence,
      sources: answer.sources,
      userId,
      contextId: context.contextId,
      timestamp: new Date(),
    };

    await this.knowledgeGraphService.storeInteraction(interaction);
  }

  private async adjustKnowledgeConfidence(questionId: string, adjustment: number): Promise<void> {
    // Adjust confidence scores in knowledge graph based on feedback
    await this.knowledgeGraphService.adjustConfidence(questionId, adjustment);
  }

  private async learnFromFeedback(event: any): Promise<void> {
    // Implement learning mechanism based on negative feedback
    logger.info('Learning from negative feedback', { event });
    // This would trigger retraining or adjustment of Q&A models
  }

  private handleQuestionError(question: string, error: any): any {
    logger.error('Q&A processing error', { question, error });

    return {
      answer:
        'I encountered an error while processing your question. Please try again or rephrase your question.',
      confidence: 0,
      sources: [],
      suggestedFollowUps: [],
    };
  }

  private async escalateToHuman(question: string, analysis: any): Promise<void> {
    await this.eventBusService.publish('qa.escalation.needed', {
      question,
      analysis,
      timestamp: new Date().toISOString(),
      priority: analysis.complexity === 'complex' ? 'high' : 'medium',
    });
  }

  private async searchConversations(query: string, context: ConversationContext): Promise<any[]> {
    // Search through previous conversations for similar Q&As
    try {
      // Temporarily disabled until proper embedding integration
      logger.info('Conversation search requested but temporarily disabled', {
        query,
        contextId: context.contextId,
      });
      return [];
    } catch (error) {
      logger.warn('Conversation search failed', { error });
      return [];
    }
  }

  /**
   * Event handler for questions
   */
  private async handleQuestion(event: any): Promise<void> {
    const { requestId, question, context, userId } = event;
    try {
      const answer = await this.processQuestion(question, context, userId);
      await this.respondToRequest(requestId, { success: true, data: answer });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleKnowledgeUpdate(event: any): Promise<void> {
    // Handle knowledge base updates
    logger.info('Knowledge update received', { event });
    // Invalidate relevant caches, update indexes, etc.
  }

  // Abstract method implementations
  protected async cleanup(): Promise<void> {
    // Clean up resources, close connections, etc.
    this.conversationMemory.clear();
    logger.info('QABotAgent cleanup completed');
  }

  protected async getHealthMetadata(): Promise<any> {
    return {
      activeConversations: this.conversationMemory.size,
      knowledgeSources: this.knowledgeSources,
      responseSettings: this.responseSettings,
      status: 'healthy',
    };
  }

  protected validateConfiguration(config: any): void {
    if (!config) {
      throw new Error('Configuration is required');
    }
    // Add specific validation logic for QA bot configuration
    if (config.responseSettings && typeof config.responseSettings !== 'object') {
      throw new Error('Response settings must be an object');
    }
  }

  protected async applyConfiguration(config: any): Promise<void> {
    if (config.knowledgeSources) {
      this.knowledgeSources = { ...this.knowledgeSources, ...config.knowledgeSources };
    }
    if (config.responseSettings) {
      this.responseSettings = { ...this.responseSettings, ...config.responseSettings };
    }
    logger.info('QABotAgent configuration applied', { config });
  }
}
