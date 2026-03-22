/**
 * Agent Discussion Service
 * Handles discussion participation for agents
 * Part of the refactored agent-intelligence microservices
 */

import {
  Agent,
  Episode,
  KnowledgeItem,
  WorkingMemoryUpdate,
  KnowledgeType,
  SourceType,
} from '@uaip/types';
import { logger, ApiError } from '@uaip/utils';
import { DiscussionService, LLMRequestTracker, ThoughtParserService } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/eventBus';
import { KnowledgeGraphService } from '@uaip/shared-services';
import { AgentMemoryService } from '@/agent-memory/agent-memory.service';
import { QmdSearchService } from '@/knowledge-graph/qmd-search.service.js';
import { MacrodataMemoryService } from '@/agent-memory/macrodata-memory.service.js';
import { ThoughtChain, THOUGHT_SYSTEM_PROMPT } from '@uaip/types';
import { LLMService, UserLLMService, LLMRequest } from '@uaip/llm-service';

export interface AgentDiscussionConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  knowledgeGraphService?: KnowledgeGraphService;
  agentMemoryService?: AgentMemoryService;
  discussionService?: DiscussionService;
  llmService: LLMService;
  userLLMService: UserLLMService;
  serviceName: string;
  securityLevel: number;
}

export class AgentDiscussionService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private knowledgeGraphService?: KnowledgeGraphService;
  private agentMemoryService?: AgentMemoryService;
  private discussionService?: DiscussionService;
  private llmService: LLMService;
  private userLLMService: UserLLMService;
  private serviceName: string;
  private securityLevel: number;

  // Track active LLM requests to prevent duplicates and monitor leaks
  private activeRequests = new Map<
    string,
    {
      timestamp: number;
      timeout: NodeJS.Timeout | null;
      responseChannel: string;
      handler: ((responseData: Record<string, unknown>) => Promise<void>) | null;
    }
  >();

  // Redis-based LLM request tracker for persistence
  private llmRequestTracker: LLMRequestTracker;

  // Thought parser for structured thinking
  private thoughtParser: ThoughtParserService;

  // QMD hybrid search (BM25 + vector) for enhanced knowledge retrieval
  private qmdSearchService?: QmdSearchService;

  // Macrodata layered memory (identity / journal / topics / distillation)
  private macrodataMemoryService?: MacrodataMemoryService;

  constructor(config: AgentDiscussionConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.knowledgeGraphService = config.knowledgeGraphService;
    this.agentMemoryService = config.agentMemoryService;
    this.discussionService = config.discussionService;
    this.llmService = config.llmService;
    this.userLLMService = config.userLLMService;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;

    // Initialize Redis-based LLM request tracker
    this.llmRequestTracker = new LLMRequestTracker(
      'agent-discussion',
      30000 // 30 second timeout
    );

    // Initialize thought parser
    this.thoughtParser = ThoughtParserService.getInstance();
  }
  async initialize(): Promise<void> {
    // Set up event subscriptions
    await this.setupEventSubscriptions();

    // Set up LLM event subscriptions
    await this.setupLLMEventSubscriptions();

    // Initialize QMD and Macrodata services using the shared typeorm DataSource
    try {
      const { typeormService } = await import('@uaip/infra/database');
      const ds = typeormService.getDataSource();
      if (ds) {
        const { getKnowledgeGraphService } = await import('@uaip/shared-services');
        const kgs = (await getKnowledgeGraphService()) as Record<string, unknown>;
        if (kgs?.vectorDb && kgs?.embeddings) {
          this.qmdSearchService = new QmdSearchService(ds, kgs.vectorDb, kgs.embeddings);
          logger.info('QmdSearchService initialized for hybrid BM25+vector memory search');
        }
        this.macrodataMemoryService = new MacrodataMemoryService(ds);
        logger.info('MacrodataMemoryService initialized for layered agent memory');
      }
    } catch (err) {
      logger.warn('QMD/Macrodata init skipped (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    logger.info('Agent Discussion Service initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel,
    });
  }

  /**
   * Set up LLM event subscriptions for event-driven LLM requests
   */
  private async setupLLMEventSubscriptions(): Promise<void> {
    // Subscribe to LLM generation responses
    await this.eventBusService.subscribe('llm.agent.generate.response', async (event) => {
      const { requestId, content, error, confidence, model } = (event as Record<string, unknown>)
        .data;

      const isPending = await this.llmRequestTracker.isPending(requestId);
      if (!isPending) {
        const pendingCount = await this.llmRequestTracker.getPendingCount();
        const pendingKeys = await this.llmRequestTracker.getPendingRequestIds();
        logger.warn('Received LLM response for unknown agent discussion request', {
          requestId,
          pendingCount,
          pendingKeys,
        });
        return;
      }

      if (error) {
        logger.warn('LLM generation failed for agent discussion', { requestId, error });
        // Complete with fallback instead of rejecting
        await this.llmRequestTracker.completePendingRequest(requestId, {
          content: '',
          confidence: 0.1,
          model: model || 'fallback',
        });
      } else {
        await this.llmRequestTracker.completePendingRequest(requestId, {
          content: content || 'I have some thoughts on this.',
          confidence: confidence || 0.7,
          model: model || 'unknown',
        });
      }
    });

    logger.info('Agent Discussion LLM event subscriptions established');
  }

  /**
   * Request LLM generation via events instead of direct calls
   */
  private async requestLLMGeneration(
    prompt: string,
    systemPrompt: string,
    temperature: number = 0.7,
    maxTokens: number = 300,
    agentId?: string,
    preSelectedModel?: string,
    preSelectedProvider?: string,
    preSelectedProviderId?: string
  ): Promise<{ content: string; confidence: number; model: string }> {
    return new Promise((resolve, reject) => {
      void (async () => {
        const requestId = `agent_disc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Add to Redis-based request tracker (30 seconds timeout)
        await this.llmRequestTracker.addPendingRequest(
          requestId,
          (response) => resolve(response),
          (error) => reject(error),
          30000,
          'agent-discussion'
        );

        try {
          // Use pre-selected model/provider if available, otherwise let LLM service decide
          const selectedModel = preSelectedModel || null;
          const selectedProvider = preSelectedProvider || null;
          const providerId = preSelectedProviderId || null;

          logger.debug('Publishing LLM agent request', {
            requestId,
            agentId: agentId || null,
            selectedModel,
            selectedProvider,
            providerId,
            hasPreSelection: !!preSelectedModel,
          });

          // Publish LLM generation request via event bus
          await this.eventBusService.publish('llm.agent.generate.request', {
            requestId,
            agentId: agentId || null,
            messages: [
              {
                id: `msg_${Date.now()}`,
                content: prompt,
                sender: 'user',
                timestamp: new Date().toISOString(),
                type: 'user' as const,
              },
            ],
            systemPrompt,
            maxTokens: maxTokens,
            temperature: temperature,
            model: selectedModel,
            provider: selectedProvider,
            providerId: providerId,
          });

          const pendingCount = await this.llmRequestTracker.getPendingCount();
          logger.debug('Agent discussion LLM request published', {
            requestId,
            pendingCount,
          });
        } catch (error) {
          await this.llmRequestTracker.failPendingRequest(requestId, error);
        }
      })().catch(reject);
    });
  }

  // Note: Request monitoring is now handled automatically by Redis TTL and LLMRequestTracker

  /**
   * Get statistics about active LLM requests for monitoring
   */
  public async getActiveRequestStats(): Promise<{
    totalActiveRequests: number;
    activeRequestsInMemory: number;
  }> {
    const totalActiveRequests = await this.llmRequestTracker.getPendingCount();

    return {
      totalActiveRequests,
      activeRequestsInMemory: this.activeRequests.size,
    };
  }

  /**
   * Set up event bus subscriptions for discussion operations
   */
  private async setupEventSubscriptions(): Promise<void> {
    // DISABLED: Direct agent participation - using only enhanced responses from ConversationEnhancementService
    // await this.eventBusService.subscribe('agent.discussion.participate', this.handleParticipateInDiscussion.bind(this));

    await this.eventBusService.subscribe(
      'agent.discussion.generate',
      this.handleGenerateResponse.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.discussion.process',
      this.handleProcessInput.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.discussion.trigger',
      this.handleTriggerParticipation.bind(this)
    );

    logger.info(
      'Agent Discussion Service event subscriptions configured (direct participation disabled)'
    );
  }

  /**
   * Handle agent participation in discussions with knowledge enhancement
   */
  /**
   * Direct agent chat (for WebSocket connections)
   */
  async participateInDiscussion(params: {
    agentId: string;
    message: string;
    userId: string;
    conversationHistory?: Record<string, unknown>[];
    context?: Record<string, unknown>;
  }): Promise<{
    response: string;
    agentName?: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
  }> {
    const { agentId, message, userId, conversationHistory = [], context: _context = {} } = params;

    try {
      logger.info('Processing direct agent chat', {
        agentId: agentId?.substring(0, 8) + '...',
        userId: userId?.substring(0, 8) + '...',
        messageLength: message?.length || 0,
        historyLength: conversationHistory.length,
      });

      // Get agent data
      const agent = await this.getAgentData(agentId);
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      // Update working memory with chat context
      if (this.agentMemoryService) {
        await this.agentMemoryService.updateWorkingMemory(agentId, {
          currentContext: {
            activeDiscussion: {
              discussionId: `chat-${Date.now()}`,
              topic: 'Direct Chat',
              participants: [userId],
              myRole: 'assistant',
              conversationHistory: conversationHistory.slice(-10),
              currentGoals: ['assist user', 'provide helpful responses'],
            },
          },
        });
      }

      // Get contextual knowledge for the chat
      // Filter out empty-content messages so TEI embedder never sees blank strings
      const safeHistory = conversationHistory.filter(
        (m: Record<string, unknown>) => m?.content && String(m.content).trim().length > 0
      );
      const contextualKnowledge = this.knowledgeGraphService
        ? await this.knowledgeGraphService.getContextualKnowledge({
            conversationHistory: safeHistory,
            relevantTags: ['chat', 'conversation'],
            scope: { agentId, userId },
          })
        : [];

      // QMD hybrid search (BM25 + vector) — runs in parallel with base retrieval
      // Merges into contextualKnowledge, deduplicating by id
      if (this.qmdSearchService) {
        try {
          const qmdResults = await this.qmdSearchService.search({
            query: message,
            userId,
            agentId,
            limit: 6,
          });
          // Merge: add QMD results not already in contextualKnowledge
          const existingIds = new Set(
            contextualKnowledge.map((k: Record<string, unknown>) => k.id)
          );
          for (const qr of qmdResults) {
            if (!existingIds.has(qr.id)) {
              contextualKnowledge.push({
                id: qr.id,
                content: qr.content,
                tags: qr.tags,
                confidence: qr.confidence,
                type: KnowledgeType.FACTUAL,
                sourceType: SourceType.AGENT_INTERACTION,
                sourceIdentifier: 'qmd-search',
                metadata: {},
                createdAt: new Date(),
                updatedAt: new Date(),
                accessLevel: 'standard',
              });
            }
          }
          logger.info('QMD hybrid search enriched knowledge', {
            added: qmdResults.length,
            total: contextualKnowledge.length,
            agentId,
          });
        } catch (qmdErr) {
          logger.warn('QMD search failed (non-fatal)', {
            error: qmdErr instanceof Error ? qmdErr.message : String(qmdErr),
          });
        }
      }

      // Macrodata: get topics layer for this agent and merge into knowledge
      if (this.macrodataMemoryService) {
        try {
          const macroCtx = await this.macrodataMemoryService.buildMemoryContext({
            agentId,
            userId,
            query: message,
            sessionEpisodes: conversationHistory.map((e: Record<string, unknown>) => ({
              role: e.sender === agent.name ? 'assistant' : 'user',
              content: e.content || '',
              timestamp: e.timestamp || new Date().toISOString(),
            })),
          });
          // Add macrodata topics as knowledge items
          const existingIds = new Set(
            contextualKnowledge.map((k: Record<string, unknown>) => k.id)
          );
          for (const t of macroCtx.topics) {
            if (t.content && !existingIds.has(t.content.slice(0, 30))) {
              contextualKnowledge.push({
                id: t.content.slice(0, 30),
                content: t.content,
                tags: t.tags,
                confidence: t.relevanceScore,
                type: KnowledgeType.EPISODIC,
                sourceType: SourceType.AGENT_EPISODE,
                sourceIdentifier: 'macrodata',
                metadata: {},
                createdAt: new Date(),
                updatedAt: new Date(),
                accessLevel: 'standard',
              });
            }
          }
          // Trigger background distillation when session has enough history
          if (conversationHistory.length >= 6) {
            this.macrodataMemoryService
              .distillEpisodes(agentId, userId, macroCtx.journal)
              .catch(() => {}); // fire and forget
          }
        } catch (macroErr) {
          logger.warn('Macrodata memory failed (non-fatal)', {
            error: macroErr instanceof Error ? macroErr.message : String(macroErr),
          });
        }
      }

      // Handle "system" userId by using agent's creator
      const effectiveUserId = userId === 'system' ? agent.createdBy : userId;

      // Generate response using LLM
      const response = await this.generateChatResponse(
        message,
        agent,
        conversationHistory,
        contextualKnowledge,
        effectiveUserId
      );

      // Store chat interaction as an episode
      if (this.agentMemoryService) {
        await this.agentMemoryService.addEpisode(agentId, {
          agentId,
          episodeId: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'collaboration',
          context: {
            when: new Date(),
            where: 'chat-interface',
            who: [userId, agentId],
            what: `Direct chat with user ${userId}`,
            why: 'User initiated chat conversation',
            how: 'Real-time chat interface',
          },
          experience: {
            actions: [
              {
                id: `action-${Date.now()}`,
                description: 'Process user message and generate response',
                type: 'chat-response',
                timestamp: new Date(),
                success: true,
                metadata: { userMessage: message, agentResponse: response },
              },
            ],
            decisions: [],
            outcomes: [
              {
                id: `outcome-${Date.now()}`,
                description: 'Successfully responded to user query',
                type: 'chat-completion',
                success: true,
                impact: 0.5,
                timestamp: new Date(),
                metadata: { responseLength: response.length },
              },
            ],
            emotions: [],
            learnings: contextualKnowledge ? ['Applied contextual knowledge in response'] : [],
          },
          significance: {
            importance: 0.3,
            novelty: 0.2,
            success: 1.0,
            impact: 0.4,
          },
          connections: {
            relatedEpisodes: [],
            triggeredBy: [],
            ledTo: [],
            similarTo: [],
          },
        } as Episode);
      }

      return {
        response,
        agentName: agent.name || 'Agent',
        confidence: 0.85,
        metadata: {
          agentId,
          timestamp: new Date().toISOString(),
          knowledgeUsed: contextualKnowledge.length,
          historyLength: conversationHistory.length,
        },
      };
    } catch (error) {
      logger.error('Direct agent chat failed', { error, agentId, userId });
      throw error;
    }
  }

  /**
   * Legacy method for discussion participation
   */
  async participateInDiscussionLegacy(
    agentId: string,
    discussionId: string,
    message: string
  ): Promise<{
    response: string;
    confidence: number;
    knowledgeContributed: boolean;
  }> {
    try {
      this.validateID(agentId, 'agentId');
      this.validateID(discussionId, 'discussionId');

      logger.info('Agent participating in discussion', { agentId, discussionId });

      // Get discussion context
      const discussion = await this.getDiscussion(discussionId);
      if (!discussion) {
        throw new Error('Discussion not found');
      }

      // Get discussion messages for context
      const discussionMessages = await this.getDiscussionMessages(discussionId);

      // Build context for the agent
      const context = {
        query: message,
        filters: {
          tags: [discussion.topic],
          agentId: agentId,
          discussionId: discussion.id,
        },
        scope: 'agent' as Record<string, unknown>,
      };

      // Get contextual knowledge
      const contextualKnowledge = this.knowledgeGraphService
        ? await this.knowledgeGraphService.getContextualKnowledge(context)
        : [];

      // Update working memory with discussion context
      if (this.agentMemoryService) {
        await this.agentMemoryService.updateWorkingMemory(agentId, {
          currentContext: {
            activeDiscussion: {
              discussionId,
              topic: discussion.topic,
              participants: discussion.participants.map((p: Record<string, unknown>) => p.id),
              myRole: 'participant',
              conversationHistory: discussionMessages?.messages?.slice(-5) || [],
              currentGoals: ['contribute meaningfully', 'share relevant knowledge'],
            },
          },
        });
      }

      // Get the agent to access creator information
      const agent = await this.getAgentData(agentId);

      // Generate knowledge-enhanced response
      const response = await this.generateDiscussionResponseInternal(
        message,
        discussion,
        contextualKnowledge,
        agentId,
        agent?.createdBy
      );

      // Store discussion participation as an episode
      if (this.agentMemoryService) {
        const episode: Episode = {
          agentId,
          episodeId: Date.now() + discussionId,
          type: 'discussion',
          context: {
            when: new Date(),
            where: 'discussion-platform',
            who: discussion.participants.map((p: Record<string, unknown>) => p.id),
            what: `Participated in discussion about ${discussion.topic}`,
            why: 'Knowledge sharing and collaboration',
            how: 'Text-based discussion',
          },
          experience: {
            actions: [
              {
                id: `action_${Date.now()}`,
                type: 'respond',
                description: 'Generated response to discussion',
                timestamp: new Date(),
                success: true,
              },
            ],
            decisions: [],
            outcomes: [],
            emotions: [],
            learnings: [`Contributed to discussion on ${discussion.topic}`],
          },
          significance: {
            importance: 0.7,
            novelty: 0.5,
            success: 1.0,
            impact: 0.6,
          },
          connections: {
            relatedEpisodes: [],
            triggeredBy: [`discussion-${discussionId}`],
            ledTo: [],
            similarTo: [],
          },
        };

        await this.agentMemoryService.storeEpisode(agentId, episode);
      }

      // Publish discussion participation event
      await this.publishDiscussionEvent('agent.discussion.participated', {
        agentId,
        discussionId,
        responseLength: response.length,
        knowledgeUsed: contextualKnowledge.length,
      });

      this.auditLog('DISCUSSION_PARTICIPATED', {
        agentId,
        discussionId,
        topic: discussion.topic,
      });

      return {
        response,
        confidence: 0.8,
        knowledgeContributed: contextualKnowledge.length > 0,
      };
    } catch (error) {
      logger.error('Failed to participate in discussion', { error, agentId, discussionId });
      throw error;
    }
  }

  /**
   * Generate direct LLM response for an agent (for external API use)
   */
  async generateAgentResponse(
    agentId: string,
    messages: Record<string, unknown>[],
    context?: Record<string, unknown>,
    userId?: string
  ): Promise<{
    response: string;
    model: string;
    tokensUsed?: number;
    confidence?: number;
    error?: string;
    knowledgeUsed: number;
    memoryEnhanced: boolean;
    suggestedTools?: Record<string, unknown>[];
    toolsExecuted?: Record<string, unknown>[];
  }> {
    try {
      this.validateID(agentId, 'agentId');

      logger.info('Generating agent response', { agentId, messagesCount: messages.length });

      // Get the agent
      const agent = await this.getAgentData(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Extract user message
      const userMessage = messages[messages.length - 1]?.content || '';

      // Search for relevant knowledge
      const relevantKnowledge = this.knowledgeGraphService
        ? await this.searchRelevantKnowledge(agentId, userMessage, { ...context, userId })
        : [];

      // Get working memory
      const workingMemory = this.agentMemoryService
        ? await this.agentMemoryService.getWorkingMemory(agentId)
        : null;

      // Build agent request for LLM
      const agentRequest = {
        agentId,
        agent: agent,
        messages,
        context: {
          ...context,
          relevantKnowledge: relevantKnowledge.slice(0, 5), // Limit to top 5
          workingMemory: workingMemory
            ? {
                lastInteraction: null,
                currentGoals: workingMemory?.currentContext?.activeDiscussion?.currentGoals || [],
              }
            : null,
          agentPersona: agent.persona,
        },
      };

      // Use provided userId or fall back to agent's creator
      const effectiveUserId = userId || agent.createdBy;

      let llmResponse;
      // Use event bus for LLM requests
      if (effectiveUserId) {
        logger.info('Requesting user-specific LLM response via event bus', {
          agentId,
          userId: effectiveUserId,
          source: userId ? 'provided' : 'agent-creator',
        });
        llmResponse = await this.requestLLMResponse(agentRequest, effectiveUserId);
      } else {
        logger.warn('No userId available, requesting global LLM response via event bus', {
          agentId,
        });
        llmResponse = await this.requestLLMResponse(agentRequest);
      }

      // Update working memory with this interaction if available
      if (this.agentMemoryService && !llmResponse.error) {
        try {
          const memoryUpdate: WorkingMemoryUpdate = {
            lastInteraction: {
              input: userMessage,
              response: llmResponse.content,
              timestamp: new Date(),
              confidence: llmResponse.confidence || 0.8,
            },
            currentInput: userMessage,
            retrievedEpisodes: [],
          };
          await this.agentMemoryService.updateWorkingMemory(agentId, memoryUpdate);
        } catch (memoryError) {
          logger.warn('Failed to update working memory', { agentId, error: memoryError });
        }
      }

      // If LLM returned an error, skip error-injected content entirely
      let responseContent: string | undefined;
      if (!llmResponse.error) {
        responseContent =
          llmResponse.content || llmResponse?.response || llmResponse?.message || llmResponse?.text;
      }
      responseContent = this.sanitizeGeneratedContent(responseContent);

      logger.info('generateAgentResponse - Final response content extracted', {
        agentId,
        hasExtractedContent: !!responseContent,
        extractedContentLength: responseContent?.length || 0,
        extractedContent: responseContent?.substring(0, 100) || 'No content',
        originalResponseStructure: llmResponse ? Object.keys(llmResponse) : 'null',
      });

      // Store interaction as knowledge
      await this.storeInteractionKnowledge(
        agentId,
        { message: userMessage, context },
        responseContent,
        []
      );

      return {
        response:
          responseContent || 'I apologize, but I encountered an issue generating a response.',
        model: llmResponse.model || 'unknown',
        tokensUsed: llmResponse.tokensUsed,
        confidence: llmResponse.confidence,
        error: llmResponse.error,
        knowledgeUsed: relevantKnowledge.length,
        memoryEnhanced: !!workingMemory,
        suggestedTools: llmResponse.suggestedTools || [],
        toolsExecuted: llmResponse.toolsExecuted || [],
      };
    } catch (error) {
      logger.error('Failed to generate agent response', {
        error: error.message,
        errorDetails: error,
        agentId,
        hasUserLLMService: !!this.userLLMService,
        hasLLMService: !!this.llmService,
      });
      return {
        response: 'I apologize, but I encountered an error while processing your request.',
        model: 'error',
        error: error.message,
        knowledgeUsed: 0,
        memoryEnhanced: false,
        suggestedTools: [],
        toolsExecuted: [],
      };
    }
  }

  /**
   * Generate chat response with structured thinking (thought protocol)
   * This method enables chain-of-thought reasoning with structured output
   */
  async generateChatResponseWithThoughts(
    agentId: string,
    userId: string,
    message: string,
    conversationId?: string,
    options?: { enableStructuredThinking?: boolean }
  ): Promise<{ response: string; thoughtChain?: ThoughtChain }> {
    const agent = await this.getAgentData(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Build system prompt with thought protocol if enabled
    let systemPrompt = agent.systemPrompt || `You are ${agent.name}. ${agent.description || ''}`;
    if (options?.enableStructuredThinking) {
      systemPrompt = `${systemPrompt}\n\n${THOUGHT_SYSTEM_PROMPT}`;
    }

    // Request LLM response via event bus
    const llmResponse = await this.requestLLMGeneration(
      message,
      systemPrompt,
      agent.temperature || 0.7,
      agent.maxTokens || 1000,
      agentId
    );

    let responseContent = llmResponse?.content || '';
    let thoughtChain: ThoughtChain | undefined;

    // Parse thoughts if structured thinking was enabled
    if (options?.enableStructuredThinking && responseContent) {
      const thoughts = this.thoughtParser.parseThoughts(responseContent);

      if (thoughts.length > 0) {
        thoughtChain = this.thoughtParser.createChain(agentId, thoughts, conversationId);

        // Extract final answer (removes thought markup)
        responseContent = this.thoughtParser.extractFinalAnswer(thoughtChain);

        // Emit thought chain event for real-time display
        await this.eventBusService.publish('agent.thought.chain', {
          agentId,
          userId,
          conversationId,
          thoughtChain,
        });

        logger.info('Structured thought chain generated', {
          agentId,
          thoughtCount: thoughts.length,
          hasConclusion: !!thoughtChain.finalConclusion,
          overallConfidence: thoughtChain.overallConfidence,
        });
      }
    }

    return { response: responseContent, thoughtChain };
  }

  /**
   * Process agent input with knowledge-enhanced reasoning and LLM-powered responses
   */
  async processAgentInput(
    agentId: string,
    input: {
      message: string;
      context?: Record<string, unknown>;
      discussionId?: string;
      operationId?: string;
      userId?: string;
    }
  ): Promise<{
    response: string;
    reasoning: string[];
    knowledgeUsed: KnowledgeItem[];
    memoryUpdated: boolean;
    llmEnhanced: boolean;
  }> {
    try {
      this.validateID(agentId, 'agentId');

      logger.info('Processing agent input', { agentId, messageLength: input.message.length });

      // Get the agent first
      const agent = await this.getAgentData(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Search for relevant knowledge
      const relevantKnowledge = this.knowledgeGraphService
        ? await this.searchRelevantKnowledge(agentId, input.message, {
            ...input.context,
            userId: input.userId,
            discussionId: input.discussionId,
          })
        : [];

      // Get similar episodes from memory
      const similarEpisodes = this.agentMemoryService
        ? await this.agentMemoryService.findSimilarEpisodes(agentId, input.message)
        : [];

      // Get working memory
      const workingMemory = this.agentMemoryService
        ? await this.agentMemoryService.getWorkingMemory(agentId)
        : null;

      // Generate reasoning based on knowledge and memory
      const reasoning = await this.generateReasoning(
        input.message,
        relevantKnowledge,
        similarEpisodes,
        workingMemory
      );

      // Generate LLM-enhanced agent response
      const effectiveUserId = input.userId || agent.createdBy;
      logger.info('Processing agent input with user context', {
        agentId,
        userId: effectiveUserId,
        source: input.userId ? 'provided' : 'agent-creator',
        hasUserContext: !!effectiveUserId,
      });

      const response = await this.generateLLMAgentResponse(
        agent,
        input,
        relevantKnowledge,
        reasoning,
        workingMemory,
        effectiveUserId
      );

      // Update working memory with this interaction
      if (this.agentMemoryService) {
        const memoryUpdate: WorkingMemoryUpdate = {
          lastInteraction: {
            input: input.message,
            response,
            timestamp: new Date(),
            confidence: 0.8,
          },
          currentInput: input.message,
          retrievedEpisodes: similarEpisodes,
        };

        await this.agentMemoryService.updateWorkingMemory(agentId, memoryUpdate);
      }

      // Store this interaction as knowledge
      await this.storeInteractionKnowledge(agentId, input, response, reasoning);

      return {
        response,
        reasoning,
        knowledgeUsed: relevantKnowledge,
        memoryUpdated: !!this.agentMemoryService,
        llmEnhanced: true,
      };
    } catch (error) {
      logger.error('Failed to process agent input', { error, agentId });
      throw error;
    }
  }

  /**
   * Generate an intelligent response for discussion participation
   */
  async generateDiscussionResponse(
    agentId: string,
    discussionId: string,
    context: {
      lastMessage?: string;
      discussionTopic?: string;
      participantCount?: number;
      messageHistory?: Record<string, unknown>[];
    }
  ): Promise<{
    response: string;
    confidence: number;
    reasoning: string[];
    shouldRespond: boolean;
  }> {
    try {
      this.validateID(agentId, 'agentId');
      this.validateID(discussionId, 'discussionId');

      logger.info('Generating discussion response', { agentId, discussionId });

      // Get agent details
      const agent = await this.getAgentData(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Get relevant knowledge for the discussion
      const relevantKnowledge = this.knowledgeGraphService
        ? await this.searchRelevantKnowledge(
            agentId,
            context.lastMessage || context.discussionTopic || '',
            context
          )
        : [];

      // Generate reasoning
      const reasoning = [
        `Analyzing discussion context for agent ${agent.name}`,
        `Topic: ${context.discussionTopic || 'General discussion'}`,
        `Participants: ${context.participantCount || 1}`,
        `Available knowledge: ${relevantKnowledge.length} items`,
      ];

      // Generate response using LLM
      const response = await this.generateIntelligentResponse(
        agent,
        context,
        relevantKnowledge,
        reasoning,
        agent.createdBy
      );

      // Calculate confidence based on knowledge availability and context clarity
      const confidence = this.calculateResponseConfidence(context, relevantKnowledge, agent);

      return {
        response,
        confidence,
        reasoning,
        shouldRespond: true,
      };
    } catch (error) {
      logger.error('Failed to generate discussion response', { error, agentId, discussionId });
      throw error;
    }
  }

  /**
   * Trigger agent participation in a discussion
   */
  async triggerAgentParticipation(params: {
    discussionId: string;
    agentId: string;
    comment?: string;
  }): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      const { discussionId, agentId, comment } = params;

      // Validate parameters
      this.validateID(agentId, 'agentId');
      this.validateID(discussionId, 'discussionId');

      // Get agent details
      const agent = await this.getAgentData(agentId);
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      logger.info(`Agent ${agent.name} joining discussion ${discussionId}`);

      // Generate agent's response to the discussion with context-aware prompts
      const discussionMessages = await this.getDiscussionMessages(discussionId);
      const messageCount = discussionMessages?.length || 0;

      let discussionPrompt: string;

      if (messageCount === 0) {
        // First message - start the discussion
        discussionPrompt = comment
          ? `Start a discussion about: ${comment}. Share your perspective or ask an opening question.`
          : `You're the first to speak in this discussion. Share an interesting perspective or ask a thought-provoking question.`;
      } else if (messageCount <= 2) {
        // Early discussion - build on what's been said
        const recentContent = discussionMessages
          .slice(-2)
          .map((m: Record<string, unknown>) => m.content)
          .join(' ');
        discussionPrompt = comment
          ? `Discussion context: ${comment}. Recent messages: "${recentContent}". Build on what's been discussed or add your perspective.`
          : `Recent discussion: "${recentContent}". Add your thoughts or ask a follow-up question.`;
      } else {
        // Ongoing discussion - continue the conversation naturally
        const recentContent = discussionMessages
          .slice(-3)
          .map((m: Record<string, unknown>) => m.content)
          .join(' ');
        discussionPrompt = comment
          ? `Context: ${comment}. Current discussion: "${recentContent}". Continue the conversation naturally.`
          : `Current discussion: "${recentContent}". Share your thoughts or respond to what's been said.`;
      }

      const response = await this.generateAgentResponse(agentId, [
        {
          id: 'trigger-prompt',
          content: discussionPrompt,
          sender: 'user',
          timestamp: new Date().toISOString(),
          type: 'user',
        },
      ]);

      // Log the response (in a real implementation, this would be sent to the discussion service)
      logger.info(`Agent ${agent.name} response:`, response.response);

      return {
        success: true,
        message: `Agent ${agent.name} successfully joined discussion ${discussionId}`,
      };
    } catch (error) {
      logger.error('Failed to trigger agent participation', {
        error: error instanceof Error ? error.message : String(error),
        errorType: error?.constructor?.name,
        stack:
          error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' | ') : undefined,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Event handlers
   */
  private async handleParticipateInDiscussion(event: Record<string, unknown>): Promise<void> {
    // Extract data from the correct event structure
    const { requestId } = event;
    const { agentId, discussionId, participantId, discussionContext } = event.data || {};

    // Debug logging to understand what's being received
    logger.info('Received participation event', {
      eventKeys: Object.keys(event),
      dataKeys: event.data ? Object.keys(event.data) : [],
      requestId,
      agentId: agentId || 'MISSING',
      agentIdType: typeof agentId,
      discussionId: discussionId || 'MISSING',
      participantId: participantId || 'MISSING',
      hasDiscussionContext: !!discussionContext,
    });

    // Validate agentId before processing
    if (!agentId || typeof agentId !== 'string' || agentId.trim() === '') {
      logger.error('Invalid agentId in participation event', {
        agentId: agentId || 'MISSING',
        agentIdType: typeof agentId,
        eventKeys: Object.keys(event),
        requestId,
        discussionId,
      });
      await this.respondToRequest(requestId, {
        success: false,
        error: `Invalid agentId: received ${agentId} (${typeof agentId})`,
      });
      return;
    }

    try {
      // Build context-aware participation message based on recent messages
      let participationPrompt = '';
      let conversationHistory: Record<string, unknown>[] = [];

      if (discussionContext?.recentMessages && discussionContext.recentMessages.length > 0) {
        // Filter out error messages and extract conversation history from recent messages
        const validMessages = discussionContext.recentMessages.filter(
          (msg: Record<string, unknown>) => {
            // Filter out common error messages
            const content = msg.content?.toLowerCase() || '';
            return (
              !content.includes('i apologize, but i encountered an error') &&
              !content.includes('please try again') &&
              !content.includes('check your provider configuration') &&
              !content.includes('error while processing') &&
              !content.includes('error while generating') &&
              content.trim().length > 0
            );
          }
        );

        conversationHistory = validMessages.map(
          (msg: Record<string, unknown>): Record<string, unknown> => {
            // Resolve participant name from available data
            let participantName = 'Unknown';
            if (msg.participantName) {
              participantName = msg.participantName;
            } else if (msg.agentId && discussionContext.activeParticipants) {
              // Find agent participant
              const agentParticipant = discussionContext.activeParticipants.find(
                (p: Record<string, unknown>) => p.agentId === msg.agentId
              );
              participantName =
                agentParticipant?.displayName || agentParticipant?.agentId || 'Agent';
            } else if (msg.participantId && discussionContext.activeParticipants) {
              // Find participant by ID
              const participant = discussionContext.activeParticipants.find(
                (p: Record<string, unknown>) => p.id === msg.participantId
              );
              participantName = participant?.displayName || participant?.agentId || 'User';
            }

            return {
              id: msg.id,
              content: msg.content,
              sender: participantName,
              timestamp: msg.timestamp,
              type: msg.agentId ? 'agent' : 'user',
            };
          }
        );

        // Check if this agent has already introduced itself (use filtered messages)
        const hasIntroduced = validMessages.some(
          (msg: Record<string, unknown>) =>
            msg.agentId === agentId &&
            (msg.content.toLowerCase().includes('hello') ||
              msg.content.toLowerCase().includes("i'm") ||
              msg.content.toLowerCase().includes('excited to join'))
        );

        // Get the last few messages for immediate context (use filtered messages)
        const lastMessages = validMessages.slice(-3);
        const lastMessageContent = lastMessages[lastMessages.length - 1]?.content || '';

        // Resolve last speaker name using the same logic as above
        let lastSpeaker = '';
        const lastMessage = lastMessages[lastMessages.length - 1];
        if (lastMessage) {
          if (lastMessage.participantName) {
            lastSpeaker = lastMessage.participantName;
          } else if (lastMessage.agentId && discussionContext.activeParticipants) {
            const agentParticipant = discussionContext.activeParticipants.find(
              (p: Record<string, unknown>) => p.agentId === lastMessage.agentId
            );
            lastSpeaker = agentParticipant?.displayName || agentParticipant?.agentId || 'Agent';
          } else if (lastMessage.participantId && discussionContext.activeParticipants) {
            const participant = discussionContext.activeParticipants.find(
              (p: Record<string, unknown>) => p.id === lastMessage.participantId
            );
            lastSpeaker = participant?.displayName || participant?.agentId || 'User';
          }
        }

        if (hasIntroduced) {
          // Agent has already introduced, respond to the conversation
          participationPrompt =
            `You are participating in a discussion about "${discussionContext.topic}". ` +
            `The last message was from ${lastSpeaker}: "${lastMessageContent}". ` +
            `Please provide a thoughtful response that adds value to the discussion. ` +
            `Do NOT re-introduce yourself as you have already done so.`;
        } else {
          // First participation - introduce and respond to context
          participationPrompt =
            `You are joining a discussion about "${discussionContext.topic}". ` +
            `There have been ${discussionContext.messageCount} messages so far. ` +
            `Please introduce yourself briefly and then contribute to the discussion based on what has been said. ` +
            `The most recent message was: "${lastMessageContent}"`;
        }
      } else {
        // Fallback to basic participation message
        participationPrompt = discussionContext
          ? `You are participating in a discussion titled "${discussionContext.title}" about "${discussionContext.topic}". ` +
            `The discussion is in the ${discussionContext.phase} phase. Please contribute meaningfully to the discussion.`
          : 'You are participating in a discussion. Please share your thoughts.';
      }

      const result = await this.participateInDiscussion({
        agentId,
        message: participationPrompt,
        userId: participantId || 'system',
        conversationHistory,
        context: {
          discussionId,
          topic: discussionContext?.topic,
          phase: discussionContext?.phase,
          activeParticipants: discussionContext?.activeParticipants || [],
        },
      });

      // Look up the correct participant ID for this agent in the discussion
      const discussion = this.discussionService
        ? await this.discussionService.getDiscussion(discussionId)
        : null;
      const participant = discussion?.participants?.find(
        (p: Record<string, unknown>) => p.agentId === agentId
      );

      if (participant && result.response) {
        const relevanceScore = this.calculateTurnRelevanceScore(
          discussionContext?.topic,
          participationPrompt,
          discussionContext?.relevanceScore
        );

        if (relevanceScore >= 0.8) {
          await this.requestPriorityTurn(discussionId, participant.id, relevanceScore);
        }

        // Send the generated response back to the discussion orchestration
        await this.eventBusService.publish('discussion.agent.message', {
          discussionId,
          participantId: participant.id,
          agentId,
          content: result.response,
          messageType: 'agent_participation',
          metadata: {
            agentId,
            isInitialParticipation: true,
            participationContext: discussionContext,
          },
        });

        logger.info('Agent participation message sent to discussion', {
          discussionId,
          agentId,
          participantId: participant.id,
          contentLength: result.response.length,
        });
      } else {
        logger.warn(
          'Could not send participation message - participant not found or no response generated',
          {
            discussionId,
            agentId,
            hasParticipant: !!participant,
            hasResponse: !!result.response,
            participantId: participant?.id,
          }
        );
      }

      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error: Record<string, unknown>) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleGenerateResponse(event: Record<string, unknown>): Promise<void> {
    const { requestId, agentId, messages, context, userId } = event.data || event;
    try {
      const result = await this.generateAgentResponse(agentId, messages, context, userId);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error: Record<string, unknown>) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleProcessInput(event: Record<string, unknown>): Promise<void> {
    const { requestId, agentId, input } = event.data || event;
    try {
      const result = await this.processAgentInput(agentId, input);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error: Record<string, unknown>) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleTriggerParticipation(event: Record<string, unknown>): Promise<void> {
    const { requestId, params } = event.data || event;
    try {
      const result = await this.triggerAgentParticipation(params);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error: Record<string, unknown>) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  /**
   * Request LLM response via event bus
   */
  private async requestLLMResponse(
    agentRequest: Record<string, unknown>,
    userId?: string
  ): Promise<unknown> {
    try {
      const requestId = `llm-request-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Check if we already have an active request with this ID (shouldn't happen, but safety check)
      if (this.activeRequests.has(requestId)) {
        logger.warn('Duplicate request ID detected', {
          requestId,
          activeRequestCount: this.activeRequests.size,
        });
        throw new Error(`Duplicate request ID: ${requestId}`);
      }

      // Publish LLM request event
      const eventType = userId ? 'llm.user.request' : 'llm.global.request';
      const eventData = {
        requestId,
        agentRequest,
        userId,
        timestamp: new Date().toISOString(),
      };

      await this.eventBusService.publish(eventType, eventData);

      // Wait for response (with timeout)
      return new Promise((resolve, reject) => {
        const responseChannel = `llm.response.${requestId}`;
        let responseHandler: ((responseData: Record<string, unknown>) => Promise<void>) | null =
          null;

        // Cleanup function
        const cleanup = async (reason: string) => {
          logger.debug(`Cleaning up LLM request: ${reason}`, { requestId, responseChannel });

          // Remove from tracking
          const request = this.activeRequests.get(requestId);
          if (request) {
            if (request.timeout) {
              clearTimeout(request.timeout);
            }
            this.activeRequests.delete(requestId);
          }

          // Unsubscribe handler
          if (responseHandler) {
            try {
              await this.eventBusService.unsubscribe(responseChannel, responseHandler);
              logger.debug('Successfully cleaned up subscription', {
                requestId,
                responseChannel,
                reason,
              });
            } catch (cleanupError: Record<string, unknown>) {
              logger.warn('Failed to cleanup subscription', {
                requestId,
                responseChannel,
                reason,
                error: cleanupError.message,
              });
            }
          }
        };

        const timeout = setTimeout(async () => {
          logger.warn('LLM request timeout', {
            requestId,
            eventType,
            activeRequestCount: this.activeRequests.size,
          });
          await cleanup('timeout');
          reject(new Error('LLM request timeout'));
        }, 90000); // 90 second timeout (LM Studio can be slow under load)

        // Define response handler with cleanup
        responseHandler = async (responseData: Record<string, unknown>): Promise<void> => {
          logger.info('LLM response received', { requestId, hasResponseData: !!responseData });

          try {
            // Extract content from event data structure
            let actualResponse = responseData;
            if (responseData && responseData.data) {
              actualResponse = responseData.data;
            }

            logger.info('LLM response data extracted', {
              requestId,
              hasActualResponse: !!actualResponse,
              actualResponseKeys: actualResponse ? Object.keys(actualResponse) : 'none',
              hasContent: !!actualResponse?.content,
            });

            await cleanup('response_received');
            resolve(actualResponse);
          } catch (error: Record<string, unknown>) {
            logger.error('Error processing LLM response', { requestId, error: error.message });
            await cleanup('response_error');
            reject(error);
          }
        };

        // Track the request
        this.activeRequests.set(requestId, {
          timestamp: Date.now(),
          timeout,
          responseChannel,
          handler: responseHandler,
        });

        // Subscribe to response
        logger.info('Subscribing to LLM response', {
          responseChannel,
          activeRequestCount: this.activeRequests.size,
        });
        this.eventBusService.subscribe(responseChannel, responseHandler);
      });
    } catch (error: Record<string, unknown>) {
      logger.error('Failed to request LLM response via event bus', { error });
      // Return fallback response
      return {
        response: 'I apologize, but I cannot process your request at the moment.',
        model: 'fallback',
        error: error.message,
      };
    }
  }

  /**
   * Helper methods
   */
  private async generateLLMAgentResponse(
    agent: Agent,
    input: Record<string, unknown>,
    relevantKnowledge: KnowledgeItem[],
    reasoning: string[],
    _workingMemory: Record<string, unknown>,
    _userId?: string
  ): Promise<string> {
    try {
      const llmRequest: LLMRequest = {
        prompt: `You are ${agent.name}. ${agent.description || ''}

Context: ${input.context ? JSON.stringify(input.context) : 'No additional context'}
User Message: ${input.message}

Relevant Knowledge:
${relevantKnowledge
  .slice(0, 3)
  .map((k: Record<string, unknown>) => `- ${k.content}`)
  .join('\n')}

Reasoning:
${reasoning.join('\n')}

Please provide a helpful and contextually appropriate response.`,
        systemPrompt: `You are ${agent.name || 'an AI assistant'}.
${agent.persona?.description ? `Your personality: ${agent.persona.description}` : ''}
Be helpful, knowledgeable, and maintain consistency with your character.`,
        maxTokens: 500,
        temperature: 0.7,
      };

      // Use event-driven LLM generation
      const llmResponse = await this.requestLLMGeneration(
        llmRequest.prompt,
        llmRequest.systemPrompt,
        llmRequest.temperature,
        llmRequest.maxTokens,
        agent.id
      );

      // Event-driven LLM response doesn't have error property, always returns content
      return llmResponse.content;
    } catch (error) {
      logger.error('Error generating LLM agent response', { error });
      return this.generateFallbackResponse(input.message, reasoning, relevantKnowledge);
    }
  }

  private async generateDiscussionResponseInternal(
    message: string,
    discussion: Record<string, unknown>,
    knowledge: KnowledgeItem[],
    agentId: string,
    userId?: string
  ): Promise<string> {
    try {
      const llmRequest: LLMRequest = {
        prompt: `Discussion topic: "${discussion.topic}"

Message to respond to: ${message}

${
  knowledge.length > 0
    ? `Relevant knowledge:\n${knowledge
        .slice(0, 3)
        .map((k: Record<string, unknown>) => `- ${k.content}`)
        .join('\n')}\n`
    : ''
}Provide a direct, thoughtful response. Avoid generic greetings or introductions.`,
        systemPrompt: `You are an AI assistant in an ongoing discussion. Be direct and substantive. Focus on the content rather than pleasantries. Contribute meaningful insights without repeating what others have said.`,
        maxTokens: 200,
        temperature: 0.7,
      };

      let response;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        response = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        // Fall back to global LLM service
        response = await this.llmService.generateResponse(llmRequest);
      }

      return response.content || 'I appreciate the opportunity to contribute to this discussion.';
    } catch (error) {
      logger.error('Error generating discussion response', { error });
      return 'I appreciate the opportunity to contribute to this discussion.';
    }
  }

  private async generateIntelligentResponse(
    agent: Agent,
    context: Record<string, unknown>,
    knowledge: KnowledgeItem[],
    reasoning: string[],
    userId?: string
  ): Promise<string> {
    try {
      const llmRequest: LLMRequest = {
        prompt: `As ${agent.name}, respond to this discussion.

Topic: ${context.discussionTopic || 'General discussion'}
${context.lastMessage ? `Recent message: ${context.lastMessage}` : 'Start the conversation'}

Available Knowledge:
${knowledge
  .slice(0, 3)
  .map((k: Record<string, unknown>) => `- ${k.content}`)
  .join('\n')}

Reasoning:
${reasoning.join('\n')}

Please provide a thoughtful contribution to the discussion.`,
        systemPrompt: `You are ${agent.name || 'an AI assistant'}.
${agent.persona?.description ? `Your personality: ${agent.persona.description}` : ''}
Participate constructively in discussions while staying true to your character.`,
        maxTokens: 300,
        temperature: 0.7,
      };

      let response;
      if (userId) {
        response = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        response = await this.llmService.generateResponse(llmRequest);
      }

      return response.content || 'Thank you for including me in this discussion.';
    } catch (error) {
      logger.error('Error generating intelligent response', { error });
      return 'Thank you for including me in this discussion.';
    }
  }

  private async generateReasoning(
    message: string,
    knowledge: KnowledgeItem[],
    episodes: Record<string, unknown>[],
    workingMemory: Record<string, unknown>
  ): Promise<string[]> {
    const reasoning = [
      `Analyzing message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`,
    ];

    if (knowledge.length > 0) {
      reasoning.push(`Found ${knowledge.length} relevant knowledge items`);
      reasoning.push(`Top knowledge: ${knowledge[0].content.substring(0, 100)}...`);
    }

    if (episodes.length > 0) {
      reasoning.push(`Found ${episodes.length} similar past episodes`);
    }

    if (workingMemory?.lastInteraction) {
      reasoning.push(`Previous interaction context available`);
    }

    return reasoning;
  }

  private generateFallbackResponse(
    message: string,
    reasoning: string[],
    knowledge: KnowledgeItem[]
  ): string {
    if (knowledge.length > 0) {
      return `Based on the available information, I can help with that. ${knowledge[0].content.substring(0, 200)}...`;
    }
    return `I understand you're asking about "${message.substring(0, 50)}...". Let me help you with that.`;
  }

  private calculateResponseConfidence(
    context: Record<string, unknown>,
    knowledge: KnowledgeItem[],
    agent: Agent
  ): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence if we have relevant knowledge
    if (knowledge.length > 0) {
      confidence += Math.min(knowledge.length * 0.1, 0.3);
    }

    // Boost confidence if agent has relevant expertise
    if (context.discussionTopic && agent.persona?.capabilities) {
      const topicKeywords = context.discussionTopic.toLowerCase().split(' ');
      const hasRelevantExpertise = agent.persona.capabilities.some((capability: string) =>
        topicKeywords.some((keyword: string) => capability.toLowerCase().includes(keyword))
      );

      if (hasRelevantExpertise) {
        confidence += 0.2;
      }
    }

    // Boost confidence if we have clear context
    if (context.lastMessage && context.lastMessage.length > 10) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  private async storeInteractionKnowledge(
    agentId: string,
    input: Record<string, unknown>,
    response: string,
    reasoning: string[]
  ): Promise<void> {
    if (this.knowledgeGraphService) {
      try {
        await this.knowledgeGraphService.ingest([
          {
            content: `Agent Interaction:
Input: ${input.message}
Response: ${response}
Context: ${input.context ? JSON.stringify(input.context) : 'None'}
Reasoning: ${reasoning.join('; ')}`,
            type: KnowledgeType.EXPERIENTIAL,
            tags: ['agent-interaction', `agent-${agentId}`, 'discussion'],
            source: {
              type: SourceType.AGENT_INTERACTION,
              identifier: `interaction-${Date.now()}`,
              metadata: { agentId, input, response },
            },
            confidence: 0.7,
          },
        ]);
      } catch (error) {
        logger.warn('Failed to store interaction knowledge', { error, agentId });
      }
    }
  }

  private async searchRelevantKnowledge(
    agentId: string,
    query: string,
    _context?: Record<string, unknown>
  ): Promise<KnowledgeItem[]> {
    if (!this.knowledgeGraphService) return [];

    try {
      const searchResult = await this.knowledgeGraphService.search({
        query,
        filters: {
          agentId,
        },
        options: {
          limit: 10,
        },
        timestamp: Date.now(),
      });
      return searchResult.items;
    } catch (error) {
      logger.warn('Failed to search relevant knowledge', { error, agentId, query });
      return [];
    }
  }

  private async getAgentData(agentId: string): Promise<Agent | null> {
    try {
      // Use AgentCoreService directly instead of RPC to avoid timeout issues
      const { AgentCoreService } = await import('./agent-core.service.js');
      const agentCoreService = new AgentCoreService({
        databaseService: this.databaseService,
        eventBusService: this.eventBusService,
        serviceName: this.serviceName,
        securityLevel: this.securityLevel,
      });

      await agentCoreService.initialize();
      // Use getAgentWithPersona to get complete agent data including persona
      const agentWithPersona = await agentCoreService.getAgentWithPersona(agentId);

      if (agentWithPersona && agentWithPersona.personaData) {
        // Map personaData to persona for compatibility with LLM service expectations
        (agentWithPersona as Record<string, unknown>).persona = agentWithPersona.personaData;
        logger.info('Agent data retrieved with persona', {
          agentId,
          agentName: agentWithPersona.name,
          hasPersona: !!agentWithPersona.personaData,
          personaKeys: agentWithPersona.personaData
            ? Object.keys(agentWithPersona.personaData)
            : [],
        });
      }

      return agentWithPersona;
    } catch (error) {
      logger.warn('Failed to get agent data', {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        agentId,
      });
      return null;
    }
  }

  private async getDiscussion(discussionId: string): Promise<unknown> {
    if (!this.discussionService) return null;
    try {
      return await this.discussionService.getDiscussion(discussionId);
    } catch (error) {
      logger.warn('Failed to get discussion', { error, discussionId });
      return null;
    }
  }

  private async getDiscussionMessages(discussionId: string): Promise<unknown> {
    try {
      // Get messages directly from discussion service
      if (!this.discussionService) {
        logger.warn('Discussion service not available for getting messages', { discussionId });
        return [];
      }
      const messages = await this.discussionService.getDiscussionMessages(discussionId);

      logger.debug('Retrieved discussion messages for context', {
        discussionId,
        messageCount: messages?.length || 0,
      });

      // Format messages for conversation history
      return (
        messages?.map((msg: Record<string, unknown>) => ({
          content: msg.content,
          sender: msg.participantId === 'system' ? 'system' : 'participant',
          timestamp: msg.createdAt,
          participantId: msg.participantId,
        })) || []
      );
    } catch (error) {
      logger.warn('Failed to get discussion messages', { error, discussionId });
      return [];
    }
  }

  private validateID(value: string, paramName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Invalid ${paramName}: must be a non-empty string`);
    }
  }

  private async publishDiscussionEvent(
    channel: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: this.serviceName,
        securityLevel: this.securityLevel,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to publish discussion event', { channel, error });
    }
  }

  private calculateTurnRelevanceScore(
    topic?: string,
    prompt?: string,
    existingScore?: number
  ): number {
    if (typeof existingScore === 'number') {
      return Math.max(0, Math.min(1, existingScore));
    }

    if (!topic || !prompt) {
      return 0;
    }

    const topicKeywords = topic
      .toLowerCase()
      .split(/\s+/)
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 2);
    if (topicKeywords.length === 0) {
      return 0;
    }

    const normalizedPrompt = prompt.toLowerCase();
    const matchedKeywords = topicKeywords.filter((keyword) => normalizedPrompt.includes(keyword));
    return Math.min(1, matchedKeywords.length / topicKeywords.length);
  }

  private async requestPriorityTurn(
    discussionId: string,
    participantId: string,
    relevanceScore: number
  ): Promise<void> {
    const discussionOrchestrationBaseUrl =
      process.env.DISCUSSION_ORCHESTRATION_URL ||
      process.env.DISCUSSION_ORCHESTRATION_BASE_URL ||
      'http://discussion-orchestration:3005';

    try {
      const response = await fetch(
        `${discussionOrchestrationBaseUrl}/api/v1/discussions/${discussionId}/turns/request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            participantId,
            relevanceScore,
          }),
        }
      );

      if (!response.ok) {
        logger.warn('Priority turn request HTTP call returned non-OK response', {
          discussionId,
          participantId,
          relevanceScore,
          status: response.status,
        });
      }
    } catch (error) {
      logger.warn('Failed to request priority turn over HTTP', {
        discussionId,
        participantId,
        relevanceScore,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Generate chat response using LLM
   */
  private async generateChatResponse(
    message: string,
    agent: Agent,
    conversationHistory: Record<string, unknown>[],
    contextualKnowledge: Record<string, unknown>[],
    userId: string
  ): Promise<string> {
    try {
      // Build conversation context from history using actual participant names
      const _historyContext = conversationHistory
        .map((entry: Record<string, unknown>) => `${entry.sender}: ${entry.content}`)
        .join('\n');

      // Build knowledge context
      const knowledgeContext =
        contextualKnowledge.length > 0
          ? `\n\nRelevant knowledge:\n${contextualKnowledge.map((k: Record<string, unknown>) => `- ${k.content}`).join('\n')}`
          : '';

      // Create agent request for event bus
      const agentRequest = {
        agent: {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          systemPrompt: agent.systemPrompt || 'You are a helpful AI assistant.',
          maxTokens: agent.maxTokens || 1000,
          temperature: agent.temperature || 0.7,
          modelId: agent.modelId,
          configuration: agent.configuration,
          persona: (agent as Record<string, unknown>).persona, // Include persona data for enhanced prompts
        },
        messages: [
          ...conversationHistory.map((entry: Record<string, unknown>) => ({
            content: entry.content,
            sender: entry.sender,
            timestamp: entry.timestamp,
          })),
          {
            content: message,
            sender: 'user',
            timestamp: new Date().toISOString(),
          },
        ],
        context: knowledgeContext ? { knowledgeContext } : undefined,
      };

      logger.info('Requesting LLM response via event bus', {
        agentId: agent.id,
        userId,
        messageLength: message.length,
        historyLength: conversationHistory.length,
        agentRequestStructure: {
          agentKeys: agentRequest.agent ? Object.keys(agentRequest.agent) : [],
          hasPersona: !!agentRequest.agent?.persona,
          personaKeys: agentRequest.agent?.persona ? Object.keys(agentRequest.agent.persona) : [],
          messagesCount: agentRequest.messages?.length || 0,
          hasContext: !!agentRequest.context,
        },
        agentPersonaData: agentRequest.agent?.persona
          ? {
              description: agentRequest.agent.persona.description,
              capabilities: agentRequest.agent.persona.capabilities,
              role: agentRequest.agent.persona.role,
            }
          : 'No persona data',
      });

      // Use event-driven LLM request - only pass userId if it's a valid UUID
      const llmResponse = await this.requestLLMResponse(
        agentRequest,
        userId && userId !== 'system' ? userId : undefined
      );

      logger.info('LLM response received from event bus', {
        agentId: agent.id,
        hasContent: !!llmResponse?.content,
        contentLength: llmResponse?.content?.length || 0,
        hasError: !!llmResponse?.error,
        responseStructure: llmResponse ? Object.keys(llmResponse) : 'null',
        rawResponse: JSON.stringify(llmResponse).substring(0, 200),
      });

      // If LLM returned an error, skip error-injected content entirely
      let responseContent: string | undefined;
      if (!llmResponse?.error) {
        responseContent =
          llmResponse?.content ||
          llmResponse?.response ||
          llmResponse?.message ||
          llmResponse?.text;
      }
      responseContent = this.sanitizeGeneratedContent(responseContent);

      logger.info('Final response content extracted', {
        agentId: agent.id,
        hasExtractedContent: !!responseContent,
        extractedContentLength: responseContent?.length || 0,
        extractedContent: responseContent?.substring(0, 100) || 'No content',
      });

      return (
        responseContent ||
        "I apologize, but I'm having trouble generating a response right now. Please try again."
      );
    } catch (error) {
      logger.error('Failed to generate chat response', { error, agentId: agent.id });
      return 'I apologize, but I encountered an error while processing your message. Please try again.';
    }
  }

  private async respondToRequest(
    requestId: string,
    response: Record<string, unknown>
  ): Promise<void> {
    await this.eventBusService.publish('agent.discussion.response', {
      requestId,
      ...response,
      timestamp: new Date().toISOString(),
    });
  }

  private static readonly ERROR_PATTERNS = [
    /i apologize, but i (am |encountered |cannot |was |have |'m )/i,
    /i appreciate the opportunity to respond/i,
    /i have some thoughts on this/i,
    /please try again( later)?/i,
    /check your provider configuration/i,
    /no llm providers are currently available/i,
    /currently unable to generate a response/i,
    /encountered an (error|issue) (while |generating |processing )/i,
    /having trouble generating a response/i,
  ];

  private sanitizeGeneratedContent(content?: string | null): string {
    const raw = (content || '').trim();
    if (!raw) return '';

    // Reject known error/fallback patterns injected by lower layers
    for (const pattern of AgentDiscussionService.ERROR_PATTERNS) {
      if (pattern.test(raw)) {
        logger.warn('sanitizeGeneratedContent: rejected error-pattern content', {
          snippet: raw.substring(0, 80),
        });
        return '';
      }
    }

    let cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
      .replace(/<think>/gi, ' ')
      .replace(/<\/think>/gi, ' ')
      .replace(/<\|im_start\|>/g, ' ')
      .replace(/<\|im_end\|>/g, ' ')
      .replace(/<\|endoftext\|>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    cleaned = cleaned.replace(/^[:\-\s]+/, '').trim();
    if (!cleaned) return '';

    if (/^'t\b/i.test(cleaned)) cleaned = `I don${cleaned}`;
    if (!/[.!?]$/.test(cleaned) && cleaned.length > 20) cleaned = `${cleaned}.`;
    if (/^[a-z]/.test(cleaned)) cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

    return cleaned;
  }

  /**
   * Process discussion message from agent chat
   * This is the public method called by routes
   */
  async processDiscussionMessage(params: {
    agentId: string;
    userId: string;
    message: string;
    conversationId: string;
    conversationHistory?: Record<string, unknown>[]; // Chat history forwarded from the frontend
    modelSelection?: Record<string, unknown>;
  }): Promise<{ response: string; metadata: Record<string, unknown> }> {
    try {
      const result = await this.participateInDiscussion({
        agentId: params.agentId,
        message: params.message,
        userId: params.userId,
        conversationHistory: params.conversationHistory || [],
      });

      const response = result.response || '';

      // NOTE: Do NOT publish agent.discussion.message here — that event triggers
      // all agents in every discussion to respond, causing a 10-13x LLM fan-out
      // that overwhelms LM Studio. Floating chat responses flow via
      // agent.chat.response (published in index.ts after this method returns).

      return {
        response: response || 'I encountered an issue generating a response.',
        metadata: {
          conversationId: params.conversationId,
          processingTime: Date.now(),
          agentId: params.agentId,
          confidence: result.confidence,
          responseType: 'user-llm',
        },
      };
    } catch (error) {
      logger.error('Failed to process discussion message', { error, agentId: params.agentId });
      return {
        response: 'Unable to process your message at this time.',
        metadata: {
          error: true,
          conversationId: params.conversationId,
          agentId: params.agentId,
        },
      };
    }
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
