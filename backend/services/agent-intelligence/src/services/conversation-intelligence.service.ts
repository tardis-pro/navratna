import { 
  EventBusService,
  UserKnowledgeService,
  QdrantService,
  EmbeddingService
} from '@uaip/shared-services';
import { LLMService } from '@uaip/llm-service';
import { logger } from '@uaip/utils';
import {
  ConversationIntelligenceEventType,
  IntentDetectionRequestedEvent,
  IntentDetectionCompletedEvent,
  TopicGenerationRequestedEvent,
  TopicGenerationCompletedEvent,
  PromptSuggestionsRequestedEvent,
  PromptSuggestionsCompletedEvent,
  AutocompleteQueryRequestedEvent,
  AutocompleteSuggestionsReadyEvent,
  Intent,
  IntentCategory,
  IntentSubType,
  PromptSuggestion,
  AutocompleteSuggestion,
  ConversationMemory,
  ConversationPattern,
  ConversationIntelligenceConfig,
  KnowledgeType,
  SourceType
} from '@uaip/types';

export class ConversationIntelligenceService {
  private config: ConversationIntelligenceConfig = {
    intent: {
      confidenceThreshold: 0.7,
      cacheEnabled: true,
      cacheTTL: 300000,
      maxHistoryContext: 10
    },
    topic: {
      minMessages: 3,
      maxTopicLength: 50,
      updateFrequency: 'periodic'
    },
    suggestions: {
      count: 3,
      diversityWeight: 0.3,
      personalizedWeight: 0.7
    },
    autocomplete: {
      minChars: 2,
      maxSuggestions: 5,
      debounceMs: 300,
      sources: ['history', 'tools']
    }
  };

  constructor(
    private eventBus: EventBusService,
    private userKnowledgeService: UserKnowledgeService | null,
    private qdrantService: QdrantService | null,
    private embeddingService: EmbeddingService | null,
    private llmService: LLMService | null,
    private redisService: any // Using any to match RedisCacheService interface
  ) {
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Intent Detection
    this.eventBus.subscribe(
      ConversationIntelligenceEventType.INTENT_DETECTION_REQUESTED,
      this.handleIntentDetectionRequest.bind(this)
    );

    // Topic Generation
    this.eventBus.subscribe(
      ConversationIntelligenceEventType.TOPIC_GENERATION_REQUESTED,
      this.handleTopicGenerationRequest.bind(this)
    );

    // Prompt Suggestions
    this.eventBus.subscribe(
      ConversationIntelligenceEventType.PROMPT_SUGGESTIONS_REQUESTED,
      this.handlePromptSuggestionsRequest.bind(this)
    );

    // Autocomplete
    this.eventBus.subscribe(
      ConversationIntelligenceEventType.AUTOCOMPLETE_QUERY_REQUESTED,
      this.handleAutocompleteQueryRequest.bind(this)
    );
  }

  private async handleIntentDetectionRequest(event: IntentDetectionRequestedEvent): Promise<void> {
    const { userId, conversationId, agentId, text, context } = event.data;

    try {
      // Check cache first
      const cacheKey = `intent:${userId}:${text.substring(0, 50)}`;
      if (this.config.intent.cacheEnabled && this.redisService) {
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
          const intent = JSON.parse(cached) as Intent;
          await this.publishIntentDetected(userId, conversationId, agentId, intent);
          return;
        }
      }

      // Generate embedding for the user input (skip if service not available)
      let inputEmbedding = null;
      if (this.embeddingService) {
        inputEmbedding = await this.embeddingService.generateEmbedding(text);
      }

      // Search for similar intents in Qdrant (skip if service not available)
      let similarIntents = [];
      if (this.qdrantService && inputEmbedding) {
        similarIntents = await this.qdrantService.search(inputEmbedding, {
          limit: 5,
          threshold: this.config.intent.confidenceThreshold,
          filters: {
            must: [
              { key: 'type', match: { value: 'intent' } },
              { key: 'userId', match: { value: userId } }
            ]
          }
        });
      }

      // Use LLM for intent classification if no high-confidence match
      let intent: Intent;
      if (similarIntents.length > 0 && similarIntents[0].score > this.config.intent.confidenceThreshold) {
        // Use the matched intent
        intent = similarIntents[0].payload as Intent;
      } else if (this.llmService) {
        // Use LLM for classification
        intent = await this.classifyIntentWithLLM(text, context);
        
        // Store the new intent pattern
        if (inputEmbedding) {
          await this.storeIntentPattern(userId, text, intent, inputEmbedding);
        }
      } else {
        // Fallback intent when no services available
        intent = {
          category: IntentCategory.CONVERSATION,
          subType: IntentSubType.EXPLORATORY,
          confidence: 0.5
        };
      }

      // Cache the result
      if (this.config.intent.cacheEnabled && this.redisService) {
        await this.redisService.set(cacheKey, JSON.stringify(intent), this.config.intent.cacheTTL);
      }

      // Generate tool preview if applicable
      const toolPreview = await this.generateToolPreview(intent);

      // Generate suggestions based on intent
      const suggestions = []; // TODO: Implement generateIntentBasedSuggestions

      // Publish the completed event
      const completedEvent: IntentDetectionCompletedEvent = {
        type: ConversationIntelligenceEventType.INTENT_DETECTION_COMPLETED,
        data: {
          userId,
          conversationId,
          agentId,
          intent,
          suggestions,
          toolPreview
        }
      };

      await this.eventBus.publish(
        ConversationIntelligenceEventType.INTENT_DETECTION_COMPLETED,
        completedEvent
      );

      // Store conversation memory
      await this.storeConversationMemory(userId, agentId, conversationId, text, intent);

    } catch (error) {
      logger.error('Failed to detect intent', { error, event });
    }
  }

  private async handleTopicGenerationRequest(event: TopicGenerationRequestedEvent): Promise<void> {
    const { conversationId, messages, currentTopic } = event.data;

    try {
      // Combine messages for analysis
      const conversationText = messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      // Generate topic using LLM (fallback if not available)
      let topicName = 'General Discussion';
      if (this.llmService) {
        try {
          const prompt = `Analyze this conversation and generate a concise topic name (2-5 words):

Current topic: ${currentTopic || 'None'}

Conversation:
${conversationText}

Generate a topic that captures the main theme of the discussion.`;

          const response = await this.llmService.generateResponse({
            prompt,
            maxTokens: 50,
            temperature: 0.3
          });

          topicName = response.content.trim();
        } catch (error) {
          logger.error('Failed to generate topic with LLM, using fallback', { error });
          topicName = `Conversation ${conversationId.substring(0, 8)}`;
        }
      }

      // Extract keywords
      const keywords = await this.extractKeywords(conversationText);

      // Generate embedding for the topic (skip if service not available)
      if (this.embeddingService && this.qdrantService) {
        try {
          const topicEmbedding = await this.embeddingService.generateEmbedding(topicName);

          // Store topic in Qdrant for future similarity searches
          await this.qdrantService.upsert([{
            id: `topic:${conversationId}`,
            content: topicName,
            embedding: topicEmbedding,
            metadata: {
              type: 'topic',
              conversationId,
              topicName,
              keywords,
              timestamp: new Date()
            }
          }]);
        } catch (error) {
          logger.error('Failed to store topic embedding', { error, conversationId });
        }
      }

      // Publish completed event
      const completedEvent: TopicGenerationCompletedEvent = {
        type: ConversationIntelligenceEventType.TOPIC_GENERATION_COMPLETED,
        data: {
          conversationId,
          topicName,
          keywords,
          summary: conversationText.substring(0, 200) + '...',
          confidence: 0.85
        }
      };

      await this.eventBus.publish(
        ConversationIntelligenceEventType.TOPIC_GENERATION_COMPLETED,
        completedEvent
      );

    } catch (error) {
      logger.error('Failed to generate topic', { error, event });
    }
  }

  private async handlePromptSuggestionsRequest(event: PromptSuggestionsRequestedEvent): Promise<void> {
    const { userId, agentId, conversationContext, count } = event.data;

    try {
      // Get user's conversation patterns
      const patterns = await this.getUserConversationPatterns(userId);

      // Get recent topics from user's knowledge (skip if service not available)
      let recentTopics = [];
      if (this.userKnowledgeService) {
        try {
          recentTopics = await this.userKnowledgeService.getKnowledgeByTags(
            userId,
            ['topic', 'conversation'],
            10
          );
        } catch (error) {
          logger.error('Failed to get recent topics', { error, userId });
        }
      }

      // Generate context embedding and search for similar conversations (skip if services not available)
      let similarConversations = [];
      if (this.embeddingService && this.qdrantService) {
        try {
          const contextText = conversationContext.recentMessages
            .map(m => m.content)
            .join(' ');
          const contextEmbedding = await this.embeddingService.generateEmbedding(contextText);

          similarConversations = await this.qdrantService.search(contextEmbedding, {
            limit: 10,
            threshold: 0.5,
            filters: {
              must: [
                { key: 'type', match: { value: 'conversation' } },
                { key: 'userId', match: { value: userId } }
              ]
            }
          });
        } catch (error) {
          logger.error('Failed to search similar conversations', { error, userId });
        }
      }

      // Generate suggestions using LLM with user context
      const suggestions = await this.generatePersonalizedSuggestions(
        userId,
        agentId,
        conversationContext,
        patterns,
        similarConversations,
        count
      );

      // Publish completed event
      const completedEvent: PromptSuggestionsCompletedEvent = {
        type: ConversationIntelligenceEventType.PROMPT_SUGGESTIONS_COMPLETED,
        data: {
          userId,
          agentId,
          suggestions
        }
      };

      await this.eventBus.publish(
        ConversationIntelligenceEventType.PROMPT_SUGGESTIONS_COMPLETED,
        completedEvent
      );

    } catch (error) {
      logger.error('Failed to generate prompt suggestions', { error, event });
    }
  }

  private async handleAutocompleteQueryRequest(event: AutocompleteQueryRequestedEvent): Promise<void> {
    const { userId, agentId, partial, context, limit } = event.data;
    const startTime = Date.now();

    try {
      const suggestions: AutocompleteSuggestion[] = [];

      // Search in user's conversation history
      if (this.config.autocomplete.sources.includes('history')) {
        const historySuggestions = await this.searchConversationHistory(userId, partial, limit);
        suggestions.push(...historySuggestions);
      }

      // Search in available tools
      if (this.config.autocomplete.sources.includes('tools')) {
        const toolSuggestions = await this.searchTools(agentId, partial, limit);
        suggestions.push(...toolSuggestions);
      }

      // Search in common patterns
      if (this.config.autocomplete.sources.includes('common')) {
        const commonSuggestions = await this.searchCommonPatterns(partial, limit);
        suggestions.push(...commonSuggestions);
      }

      // Sort by score and limit
      const finalSuggestions = suggestions
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // Publish ready event
      const readyEvent: AutocompleteSuggestionsReadyEvent = {
        type: ConversationIntelligenceEventType.AUTOCOMPLETE_SUGGESTIONS_READY,
        data: {
          userId,
          agentId,
          suggestions: finalSuggestions,
          queryTime: Date.now() - startTime
        }
      };

      await this.eventBus.publish(
        ConversationIntelligenceEventType.AUTOCOMPLETE_SUGGESTIONS_READY,
        readyEvent
      );

    } catch (error) {
      logger.error('Failed to generate autocomplete suggestions', { error, event });
    }
  }

  // Helper methods

  private async classifyIntentWithLLM(text: string, context: any): Promise<Intent> {
    if (!this.llmService) {
      // Fallback intent when LLM service not available
      return {
        category: IntentCategory.CONVERSATION,
        subType: IntentSubType.EXPLORATORY,
        confidence: 0.5
      };
    }

    const prompt = `Classify the following user input into an intent category and sub-type:

User input: "${text}"

Context: ${JSON.stringify(context?.previousMessages?.slice(-3) || [])}

Categories: question, command, tool_request, conversation, clarification
Question sub-types: factual, exploratory, troubleshooting, how_to
Command sub-types: create, update, delete, configure
Tool sub-types: execute_code, search_web, analyze_data, create_artifact

Respond in JSON format:
{
  "category": "...",
  "subType": "...",
  "confidence": 0.0-1.0,
  "extractedParameters": {},
  "suggestedTools": [],
  "reasoning": "..."
}`;

    try {
      const response = await this.llmService.generateResponse({
        prompt,
        maxTokens: 200,
        temperature: 0.1
      });

      return JSON.parse(response.content) as Intent;
    } catch {
      // Fallback intent
      return {
        category: IntentCategory.CONVERSATION,
        subType: IntentSubType.EXPLORATORY,
        confidence: 0.5
      };
    }
  }

  private async generateToolPreview(intent: Intent): Promise<any> {
    if (intent.category !== IntentCategory.TOOL_REQUEST) {
      return undefined;
    }

    // Map intent sub-types to tool configurations
    const toolMap: Record<string, any> = {
      [IntentSubType.EXECUTE_CODE]: {
        name: 'Code Executor',
        description: 'Execute code in a sandboxed environment',
        estimatedDuration: 2000
      },
      [IntentSubType.SEARCH_WEB]: {
        name: 'Web Search',
        description: 'Search the web for information',
        estimatedDuration: 3000
      },
      [IntentSubType.ANALYZE_DATA]: {
        name: 'Data Analyzer',
        description: 'Analyze and visualize data',
        estimatedDuration: 5000
      },
      [IntentSubType.CREATE_ARTIFACT]: {
        name: 'Artifact Creator',
        description: 'Generate documents, code, or other artifacts',
        estimatedDuration: 10000
      }
    };

    const tool = toolMap[intent.subType];
    if (!tool) return undefined;

    return {
      ...tool,
      parameters: intent.extractedParameters || {},
      requiresConfirmation: true
    };
  }

  private async storeIntentPattern(
    userId: string,
    text: string,
    intent: Intent,
    embedding: number[]
  ): Promise<void> {
    if (!this.qdrantService || !embedding) {
      return; // Skip if service or embedding not available
    }

    try {
      await this.qdrantService.upsert([{
        id: `intent:${userId}:${Date.now()}`,
        content: text,
        embedding: embedding,
        metadata: {
          type: 'intent',
          userId,
          text,
          intent,
          timestamp: new Date()
        }
      }]);
    } catch (error) {
      logger.error('Failed to store intent pattern', { error, userId, text });
    }
  }

  private async storeConversationMemory(
    userId: string,
    agentId: string,
    conversationId: string,
    userMessage: string,
    intent: Intent
  ): Promise<void> {
    if (!this.userKnowledgeService) {
      return; // Skip if service not available
    }

    try {
      const memory: Partial<ConversationMemory> = {
        userId,
        agentId,
        conversationId,
        turn: {
          userMessage,
          assistantResponse: '', // Will be filled later
          intent,
          timestamp: new Date()
        }
      };

      // Store in user knowledge
      await this.userKnowledgeService.addKnowledge(userId, [{
        content: JSON.stringify(memory),
        type: KnowledgeType.EPISODIC,
        tags: ['conversation', 'memory', intent.category],
        source: {
          type: SourceType.AGENT_INTERACTION,
          identifier: agentId
        }
      }]);

      // Emit pattern detection event
      await this.eventBus.publish(
        ConversationIntelligenceEventType.CONVERSATION_MEMORY_STORED,
        { userId, agentId, conversationId, memory }
      );
    } catch (error) {
      logger.error('Failed to store conversation memory', { error, userId, agentId });
    }
  }

  private async getUserConversationPatterns(userId: string): Promise<ConversationPattern[]> {
    if (!this.userKnowledgeService) {
      return []; // Return empty array if service not available
    }

    try {
      const patterns = await this.userKnowledgeService.getKnowledgeByTags(
        userId,
        ['pattern', 'conversation'],
        20
      );

      return patterns.map(p => JSON.parse(p.content) as ConversationPattern);
    } catch (error) {
      logger.error('Failed to get user conversation patterns', { error, userId });
      return [];
    }
  }

  private async extractKeywords(text: string): Promise<string[]> {
    if (!this.llmService) {
      // Fallback: simple keyword extraction
      const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 3);
      return words.slice(0, 5);
    }

    try {
      const prompt = `Extract 3-5 key topics/keywords from this text: "${text}"
Return as a JSON array of strings.`;

      const response = await this.llmService.generateResponse({
        prompt,
        maxTokens: 100,
        temperature: 0.3
      });

      return JSON.parse(response.content) as string[];
    } catch {
      // Fallback: simple keyword extraction
      const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 3);
      return words.slice(0, 5);
    }
  }

  private async generatePersonalizedSuggestions(
    userId: string,
    agentId: string,
    context: any,
    patterns: ConversationPattern[],
    similarConversations: any[],
    count: number
  ): Promise<PromptSuggestion[]> {
    if (!this.llmService) {
      // Fallback suggestions when LLM service not available
      return [
        {
          prompt: "How can you help me?",
          category: IntentCategory.QUESTION,
          reasoning: "Basic help inquiry",
          confidence: 0.8,
          relevanceScore: 0.9,
          basedOn: ["capability" as const]
        },
        {
          prompt: "What can you do?",
          category: IntentCategory.QUESTION, 
          reasoning: "Capability inquiry",
          confidence: 0.8,
          relevanceScore: 0.9,
          basedOn: ["capability" as const]
        }
      ].slice(0, count);
    }

    try {
      const prompt = `Generate ${count} personalized prompt suggestions based on:

Current context: ${JSON.stringify(context)}
User patterns: ${JSON.stringify(patterns.slice(0, 3))}
Similar past conversations: ${JSON.stringify(similarConversations.slice(0, 3).map(c => c.payload))}

Generate diverse, relevant prompts that the user is likely to ask next.
Return as JSON array with format:
[{
  "prompt": "...",
  "category": "question|command|tool_request|conversation|clarification",
  "reasoning": "...",
  "confidence": 0.0-1.0,
  "relevanceScore": 0.0-1.0,
  "basedOn": ["history", "context", "capability"]
}]`;

      const response = await this.llmService.generateResponse({
        prompt,
        maxTokens: 500,
        temperature: 0.7
      });

      return JSON.parse(response.content) as PromptSuggestion[];
    } catch (error) {
      logger.error('Failed to generate personalized suggestions', { error, userId });
      return [];
    }
  }

  private async searchConversationHistory(
    userId: string,
    partial: string,
    limit: number
  ): Promise<AutocompleteSuggestion[]> {
    if (!this.embeddingService || !this.qdrantService) {
      return []; // Return empty array if services not available
    }

    try {
      const embedding = await this.embeddingService.generateEmbedding(partial);
      
      const results = await this.qdrantService.search(embedding, {
        limit: limit * 2,
        threshold: 0.3,
        filters: {
          must: [
            { key: 'type', match: { value: 'conversation' } },
            { key: 'userId', match: { value: userId } }
          ]
        }
      });

      return results
        .filter(r => r.payload?.text?.toLowerCase().startsWith(partial.toLowerCase()))
        .map(r => ({
          text: r.payload.text,
          type: 'previous' as const,
          score: r.score,
          metadata: {
            lastUsed: new Date(r.payload.timestamp),
            frequency: r.payload.frequency || 1
          }
        }))
        .slice(0, limit);
    } catch (error) {
      logger.error('Failed to search conversation history', { error, userId, partial });
      return [];
    }
  }

  private async searchTools(agentId: string, partial: string, limit: number): Promise<AutocompleteSuggestion[]> {
    // This would integrate with the capability registry
    // For now, return mock data
    const tools = [
      { name: 'search', description: 'Search the web' },
      { name: 'execute', description: 'Execute code' },
      { name: 'analyze', description: 'Analyze data' },
      { name: 'create', description: 'Create artifacts' }
    ];

    return tools
      .filter(t => t.name.startsWith(partial.toLowerCase()))
      .map(t => ({
        text: `/${t.name}`,
        type: 'tool' as const,
        score: 0.8,
        metadata: {
          description: t.description,
          icon: '🔧'
        }
      }))
      .slice(0, limit);
  }

  private async searchCommonPatterns(partial: string, limit: number): Promise<AutocompleteSuggestion[]> {
    const commonPatterns = [
      'How do I',
      'Can you help me',
      'What is',
      'Show me',
      'Create a',
      'Update the',
      'Delete',
      'Find all',
      'Analyze',
      'Generate'
    ];

    return commonPatterns
      .filter(p => p.toLowerCase().startsWith(partial.toLowerCase()))
      .map(p => ({
        text: p,
        type: 'common' as const,
        score: 0.6,
        metadata: {
          description: 'Common pattern'
        }
      }))
      .slice(0, limit);
  }

  private async publishIntentDetected(
    userId: string,
    conversationId: string,
    agentId: string,
    intent: Intent
  ): Promise<void> {
    const completedEvent: IntentDetectionCompletedEvent = {
      type: ConversationIntelligenceEventType.INTENT_DETECTION_COMPLETED,
      data: {
        userId,
        conversationId,
        agentId,
        intent
      }
    };

    await this.eventBus.publish(
      ConversationIntelligenceEventType.INTENT_DETECTION_COMPLETED,
      completedEvent
    );
  }
}