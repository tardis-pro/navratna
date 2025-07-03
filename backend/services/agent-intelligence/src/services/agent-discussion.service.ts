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
  SourceType
} from '@uaip/types';
import { logger, ApiError } from '@uaip/utils';
import {
  DatabaseService,
  EventBusService,
  KnowledgeGraphService,
  AgentMemoryService,
  DiscussionService
} from '@uaip/shared-services';
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
  }

  async initialize(): Promise<void> {
    // Set up event subscriptions
    await this.setupEventSubscriptions();

    logger.info('Agent Discussion Service initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel
    });
  }

  /**
   * Set up event bus subscriptions for discussion operations
   */
  private async setupEventSubscriptions(): Promise<void> {
    await this.eventBusService.subscribe('agent.discussion.participate', this.handleParticipateInDiscussion.bind(this));
    await this.eventBusService.subscribe('agent.discussion.generate', this.handleGenerateResponse.bind(this));
    await this.eventBusService.subscribe('agent.discussion.process', this.handleProcessInput.bind(this));
    await this.eventBusService.subscribe('agent.discussion.trigger', this.handleTriggerParticipation.bind(this));

    logger.info('Agent Discussion Service event subscriptions configured');
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
    conversationHistory?: any[];
    context?: any;
  }): Promise<{
    response: string;
    agentName?: string;
    confidence?: number;
    metadata?: any;
  }> {
    const { agentId, message, userId, conversationHistory = [], context = {} } = params;
    
    try {
      logger.info('Processing direct agent chat', { 
        agentId: agentId?.substring(0, 8) + '...',
        userId: userId?.substring(0, 8) + '...',
        messageLength: message?.length || 0,
        historyLength: conversationHistory.length
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
              currentGoals: ['assist user', 'provide helpful responses']
            }
          }
        });
      }

      // Get contextual knowledge for the chat
      const contextualKnowledge = this.knowledgeGraphService ?
        await this.knowledgeGraphService.getContextualKnowledge({
          discussionHistory: conversationHistory,
          relevantTags: ['chat', 'conversation'],
          scope: { agentId, userId }
        }) : [];

      // Generate response using LLM
      const response = await this.generateChatResponse(
        message,
        agent,
        conversationHistory,
        contextualKnowledge,
        userId
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
            how: 'Real-time chat interface'
          },
          experience: {
            actions: [{
              id: `action-${Date.now()}`,
              description: 'Process user message and generate response',
              type: 'chat-response',
              timestamp: new Date(),
              success: true,
              metadata: { userMessage: message, agentResponse: response }
            }],
            decisions: [],
            outcomes: [{
              id: `outcome-${Date.now()}`,
              description: 'Successfully responded to user query',
              type: 'chat-completion',
              success: true,
              impact: 0.5,
              timestamp: new Date(),
              metadata: { responseLength: response.length }
            }],
            emotions: [],
            learnings: contextualKnowledge ? ['Applied contextual knowledge in response'] : []
          },
          significance: {
            importance: 0.3,
            novelty: 0.2,
            success: 1.0,
            impact: 0.4
          },
          connections: {
            relatedEpisodes: [],
            triggeredBy: [],
            ledTo: [],
            similarTo: []
          }
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
          historyLength: conversationHistory.length
        }
      };

    } catch (error) {
      logger.error('Direct agent chat failed', { error, agentId, userId });
      throw error;
    }
  }

  /**
   * Legacy method for discussion participation
   */
  async participateInDiscussionLegacy(agentId: string, discussionId: string, message: string): Promise<{
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
          discussionId: discussion.id
        },
        scope: 'agent' as any
      };

      // Get contextual knowledge
      const contextualKnowledge = this.knowledgeGraphService ?
        await this.knowledgeGraphService.getContextualKnowledge(context) : [];

      // Update working memory with discussion context
      if (this.agentMemoryService) {
        await this.agentMemoryService.updateWorkingMemory(agentId, {
          currentContext: {
            activeDiscussion: {
              discussionId,
              topic: discussion.topic,
              participants: discussion.participants.map(p => p.id),
              myRole: 'participant',
              conversationHistory: discussionMessages?.messages?.slice(-5) || [],
              currentGoals: ['contribute meaningfully', 'share relevant knowledge']
            }
          }
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
            who: discussion.participants.map(p => p.id),
            what: `Participated in discussion about ${discussion.topic}`,
            why: 'Knowledge sharing and collaboration',
            how: 'Text-based discussion'
          },
          experience: {
            actions: [
              {
                id: `action_${Date.now()}`,
                type: 'respond',
                description: 'Generated response to discussion',
                timestamp: new Date(),
                success: true
              }
            ],
            decisions: [],
            outcomes: [],
            emotions: [],
            learnings: [`Contributed to discussion on ${discussion.topic}`]
          },
          significance: {
            importance: 0.7,
            novelty: 0.5,
            success: 1.0,
            impact: 0.6
          },
          connections: {
            relatedEpisodes: [],
            triggeredBy: [`discussion-${discussionId}`],
            ledTo: [],
            similarTo: []
          }
        };

        await this.agentMemoryService.storeEpisode(agentId, episode);
      }

      // Publish discussion participation event
      await this.publishDiscussionEvent('agent.discussion.participated', {
        agentId,
        discussionId,
        responseLength: response.length,
        knowledgeUsed: contextualKnowledge.length
      });

      this.auditLog('DISCUSSION_PARTICIPATED', {
        agentId,
        discussionId,
        topic: discussion.topic
      });

      return {
        response,
        confidence: 0.8,
        knowledgeContributed: contextualKnowledge.length > 0
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
    messages: any[],
    context?: any,
    userId?: string
  ): Promise<{
    response: string;
    model: string;
    tokensUsed?: number;
    confidence?: number;
    error?: string;
    knowledgeUsed: number;
    memoryEnhanced: boolean;
    suggestedTools?: any[];
    toolsExecuted?: any[];
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
      const relevantKnowledge = this.knowledgeGraphService ?
        await this.searchRelevantKnowledge(agentId, userMessage, { ...context, userId }) : [];

      // Get working memory
      const workingMemory = this.agentMemoryService ?
        await this.agentMemoryService.getWorkingMemory(agentId) : null;

      // Build agent request for LLM
      const agentRequest = {
        agentId,
        agent: agent,
        messages,
        context: {
          ...context,
          relevantKnowledge: relevantKnowledge.slice(0, 5), // Limit to top 5
          workingMemory: workingMemory ? {
            lastInteraction: null,
            currentGoals: workingMemory?.currentContext?.activeDiscussion?.currentGoals || []
          } : null,
          agentPersona: agent.persona
        }
      };

      // Use provided userId or fall back to agent's creator
      const effectiveUserId = userId || agent.createdBy;

      let llmResponse;
      if (effectiveUserId) {
        // Use user-specific LLM service if userId is available
        logger.info('Using user-specific LLM service for agent response', {
          agentId,
          userId: effectiveUserId,
          source: userId ? 'provided' : 'agent-creator'
        });
        llmResponse = await this.userLLMService.generateAgentResponse(effectiveUserId, agentRequest);
      } else {
        // Fall back to global LLM service
        logger.warn('No userId available, using global LLM service for agent response', { agentId });
        llmResponse = await this.llmService.generateAgentResponse(agentRequest);
      }

      // Update working memory with this interaction if available
      if (this.agentMemoryService && !llmResponse.error) {
        try {
          const memoryUpdate: WorkingMemoryUpdate = {
            lastInteraction: {
              input: userMessage,
              response: llmResponse.content,
              timestamp: new Date(),
              confidence: llmResponse.confidence || 0.8
            },
            currentInput: userMessage,
            retrievedEpisodes: []
          };
          await this.agentMemoryService.updateWorkingMemory(agentId, memoryUpdate);
        } catch (memoryError) {
          logger.warn('Failed to update working memory', { agentId, error: memoryError });
        }
      }

      // Store interaction as knowledge
      await this.storeInteractionKnowledge(agentId, { message: userMessage, context }, llmResponse.content, []);

      return {
        response: llmResponse.content || 'I apologize, but I encountered an issue generating a response.',
        model: llmResponse.model || 'unknown',
        tokensUsed: llmResponse.tokensUsed,
        confidence: llmResponse.confidence,
        error: llmResponse.error,
        knowledgeUsed: relevantKnowledge.length,
        memoryEnhanced: !!workingMemory,
        suggestedTools: llmResponse.suggestedTools || [],
        toolsExecuted: llmResponse.toolsExecuted || []
      };
    } catch (error) {
      logger.error('Failed to generate agent response', { error, agentId });
      return {
        response: 'I apologize, but I encountered an error while processing your request.',
        model: 'error',
        error: error.message,
        knowledgeUsed: 0,
        memoryEnhanced: false,
        suggestedTools: [],
        toolsExecuted: []
      };
    }
  }

  /**
   * Process agent input with knowledge-enhanced reasoning and LLM-powered responses
   */
  async processAgentInput(agentId: string, input: {
    message: string;
    context?: any;
    discussionId?: string;
    operationId?: string;
    userId?: string;
  }): Promise<{
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
      const relevantKnowledge = this.knowledgeGraphService ?
        await this.searchRelevantKnowledge(agentId, input.message, {
          ...input.context,
          userId: input.userId,
          discussionId: input.discussionId
        }) : [];

      // Get similar episodes from memory
      const similarEpisodes = this.agentMemoryService ?
        await this.agentMemoryService.findSimilarEpisodes(agentId, input.message) : [];

      // Get working memory
      const workingMemory = this.agentMemoryService ?
        await this.agentMemoryService.getWorkingMemory(agentId) : null;

      // Generate reasoning based on knowledge and memory
      const reasoning = await this.generateReasoning(input.message, relevantKnowledge, similarEpisodes, workingMemory);

      // Generate LLM-enhanced agent response
      const effectiveUserId = input.userId || agent.createdBy;
      logger.info('Processing agent input with user context', {
        agentId,
        userId: effectiveUserId,
        source: input.userId ? 'provided' : 'agent-creator',
        hasUserContext: !!effectiveUserId
      });

      const response = await this.generateLLMAgentResponse(agent, input, relevantKnowledge, reasoning, workingMemory, effectiveUserId);

      // Update working memory with this interaction
      if (this.agentMemoryService) {
        const memoryUpdate: WorkingMemoryUpdate = {
          lastInteraction: {
            input: input.message,
            response,
            timestamp: new Date(),
            confidence: 0.8
          },
          currentInput: input.message,
          retrievedEpisodes: similarEpisodes
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
        llmEnhanced: true
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
      messageHistory?: any[];
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
      const relevantKnowledge = this.knowledgeGraphService ?
        await this.searchRelevantKnowledge(
          agentId,
          context.lastMessage || context.discussionTopic || '',
          context
        ) : [];

      // Generate reasoning
      const reasoning = [
        `Analyzing discussion context for agent ${agent.name}`,
        `Topic: ${context.discussionTopic || 'General discussion'}`,
        `Participants: ${context.participantCount || 1}`,
        `Available knowledge: ${relevantKnowledge.length} items`
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
      const confidence = this.calculateResponseConfidence(
        context,
        relevantKnowledge,
        agent
      );

      return {
        response,
        confidence,
        reasoning,
        shouldRespond: true
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

      // Generate agent's response to the discussion
      const discussionPrompt = comment
        ? `You are participating in a discussion. Context: ${comment}. Please provide your initial thoughts or response.`
        : `You are participating in a discussion. Please provide your initial thoughts.`;

      const response = await this.generateAgentResponse(agentId, [{
        id: 'trigger-prompt',
        content: discussionPrompt,
        sender: 'user',
        timestamp: new Date().toISOString(),
        type: 'user'
      }]);

      // Log the response (in a real implementation, this would be sent to the discussion service)
      logger.info(`Agent ${agent.name} response:`, response.response);

      return {
        success: true,
        message: `Agent ${agent.name} successfully joined discussion ${discussionId}`,
      };
    } catch (error) {
      logger.error('Failed to trigger agent participation', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Event handlers
   */
  private async handleParticipateInDiscussion(event: any): Promise<void> {
    const { requestId, agentId, discussionId, message } = event;
    try {
      const result = await this.participateInDiscussion({
        agentId,
        message,
        userId: 'system' // Default for event-driven participation
      });
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleGenerateResponse(event: any): Promise<void> {
    const { requestId, agentId, messages, context, userId } = event;
    try {
      const result = await this.generateAgentResponse(agentId, messages, context, userId);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleProcessInput(event: any): Promise<void> {
    const { requestId, agentId, input } = event;
    try {
      const result = await this.processAgentInput(agentId, input);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleTriggerParticipation(event: any): Promise<void> {
    const { requestId, params } = event;
    try {
      const result = await this.triggerAgentParticipation(params);
      await this.respondToRequest(requestId, { success: true, data: result });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  /**
   * Helper methods
   */
  private async generateLLMAgentResponse(
    agent: Agent,
    input: any,
    relevantKnowledge: KnowledgeItem[],
    reasoning: string[],
    workingMemory: any,
    userId?: string
  ): Promise<string> {
    try {
      const llmRequest: LLMRequest = {
        prompt: `You are ${agent.name}. ${agent.description || ''}

Context: ${input.context ? JSON.stringify(input.context) : 'No additional context'}
User Message: ${input.message}

Relevant Knowledge:
${relevantKnowledge.slice(0, 3).map(k => `- ${k.content}`).join('\n')}

Reasoning:
${reasoning.join('\n')}

Please provide a helpful and contextually appropriate response.`,
        systemPrompt: `You are ${agent.name || 'an AI assistant'}.
${agent.persona?.description ? `Your personality: ${agent.persona.description}` : ''}
Be helpful, knowledgeable, and maintain consistency with your character.`,
        maxTokens: 500,
        temperature: 0.7
      };

      let llmResponse;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        llmResponse = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        // Fall back to global LLM service
        llmResponse = await this.llmService.generateResponse(llmRequest);
      }

      if (llmResponse.error) {
        logger.warn('LLM agent response failed, using fallback', { error: llmResponse.error });
        return this.generateFallbackResponse(input.message, reasoning, relevantKnowledge);
      }

      return llmResponse.content;
    } catch (error) {
      logger.error('Error generating LLM agent response', { error });
      return this.generateFallbackResponse(input.message, reasoning, relevantKnowledge);
    }
  }

  private async generateDiscussionResponseInternal(
    message: string,
    discussion: any,
    knowledge: KnowledgeItem[],
    agentId: string,
    userId?: string
  ): Promise<string> {
    try {
      const llmRequest: LLMRequest = {
        prompt: `You are participating in a discussion about "${discussion.topic}".

Current message: ${message}

Relevant knowledge:
${knowledge.slice(0, 3).map(k => `- ${k.content}`).join('\n')}

Please provide a thoughtful response that contributes to the discussion.
Keep the response concise but meaningful.`,
        systemPrompt: `You are an AI assistant participating in a collaborative discussion.
Your role is to contribute thoughtful, evidence-based insights while maintaining a respectful and collaborative tone.
Be helpful, knowledgeable, and constructive in your contributions.`,
        maxTokens: 200,
        temperature: 0.7
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
    context: any,
    knowledge: KnowledgeItem[],
    reasoning: string[],
    userId?: string
  ): Promise<string> {
    try {
      const llmRequest: LLMRequest = {
        prompt: `You are ${agent.name}, participating in a discussion.

Discussion Topic: ${context.discussionTopic || 'General discussion'}
Recent Context: ${context.lastMessage || 'No recent messages'}

Available Knowledge:
${knowledge.slice(0, 3).map(k => `- ${k.content}`).join('\n')}

Reasoning:
${reasoning.join('\n')}

Please provide a thoughtful contribution to the discussion.`,
        systemPrompt: `You are ${agent.name || 'an AI assistant'}.
${agent.persona?.description ? `Your personality: ${agent.persona.description}` : ''}
Participate constructively in discussions while staying true to your character.`,
        maxTokens: 300,
        temperature: 0.7
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
    episodes: any[],
    workingMemory: any
  ): Promise<string[]> {
    const reasoning = [
      `Analyzing message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`
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

  private generateFallbackResponse(message: string, reasoning: string[], knowledge: KnowledgeItem[]): string {
    if (knowledge.length > 0) {
      return `Based on the available information, I can help with that. ${knowledge[0].content.substring(0, 200)}...`;
    }
    return `I understand you're asking about "${message.substring(0, 50)}...". Let me help you with that.`;
  }

  private calculateResponseConfidence(context: any, knowledge: KnowledgeItem[], agent: Agent): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence if we have relevant knowledge
    if (knowledge.length > 0) {
      confidence += Math.min(knowledge.length * 0.1, 0.3);
    }

    // Boost confidence if agent has relevant expertise
    if (context.discussionTopic && agent.persona?.capabilities) {
      const topicKeywords = context.discussionTopic.toLowerCase().split(' ');
      const hasRelevantExpertise = agent.persona.capabilities.some((capability: string) =>
        topicKeywords.some(keyword => capability.toLowerCase().includes(keyword))
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
    input: any,
    response: string,
    reasoning: string[]
  ): Promise<void> {
    if (this.knowledgeGraphService) {
      try {
        await this.knowledgeGraphService.ingest([{
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
            metadata: { agentId, input, response }
          },
          confidence: 0.7
        }]);
      } catch (error) {
        logger.warn('Failed to store interaction knowledge', { error, agentId });
      }
    }
  }

  private async searchRelevantKnowledge(agentId: string, query: string, context?: any): Promise<KnowledgeItem[]> {
    if (!this.knowledgeGraphService) return [];

    try {
      const searchResult = await this.knowledgeGraphService.search({
        query,
        filters: {
          agentId
        },
        options: {
          limit: 10
        },
        timestamp: Date.now()
      });
      return searchResult.items;
    } catch (error) {
      logger.warn('Failed to search relevant knowledge', { error, agentId, query });
      return [];
    }
  }

  private async getAgentData(agentId: string): Promise<Agent | null> {
    try {
      const response = await this.eventBusService.request('agent.query.get', { agentId });
      return response.success ? response.data : null;
    } catch (error) {
      logger.warn('Failed to get agent data', { error, agentId });
      return null;
    }
  }

  private async getDiscussion(discussionId: string): Promise<any> {
    if (!this.discussionService) return null;
    try {
      return await this.discussionService.getDiscussion(discussionId);
    } catch (error) {
      logger.warn('Failed to get discussion', { error, discussionId });
      return null;
    }
  }

  private async getDiscussionMessages(discussionId: string): Promise<any> {
    if (!this.discussionService) return null;
    try {
      // Use a compatible method or return empty for now
      return { messages: [] };
    } catch (error) {
      logger.warn('Failed to get discussion messages', { error, discussionId });
      return null;
    }
  }

  private validateID(value: string, paramName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Invalid ${paramName}: must be a non-empty string`);
    }
  }

  private async publishDiscussionEvent(channel: string, data: any): Promise<void> {
    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: this.serviceName,
        securityLevel: this.securityLevel,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to publish discussion event', { channel, error });
    }
  }

  /**
   * Generate chat response using LLM
   */
  private async generateChatResponse(
    message: string,
    agent: Agent,
    conversationHistory: any[],
    contextualKnowledge: any[],
    userId: string
  ): Promise<string> {
    try {
      // Build conversation context from history
      const historyContext = conversationHistory.map(entry => 
        `${entry.sender === 'user' ? 'User' : 'Assistant'}: ${entry.content}`
      ).join('\n');

      // Build knowledge context
      const knowledgeContext = contextualKnowledge.length > 0 
        ? `\n\nRelevant knowledge:\n${contextualKnowledge.map(k => `- ${k.content}`).join('\n')}`
        : '';

      // Create chat prompt
      const prompt = `${agent.systemPrompt || 'You are a helpful AI assistant.'}

Agent Name: ${agent.name}
Role: ${agent.role}

${historyContext ? `Previous conversation:\n${historyContext}\n` : ''}${knowledgeContext}

User: ${message}
Assistant:`;

      // Use LLM service to generate response
      const llmRequest: LLMRequest = {
        prompt,
        maxTokens: agent.maxTokens || 1000,
        temperature: agent.temperature || 0.7,
        userId,
        agentId: agent.id
      };

      const llmResponse = await this.llmService.generateResponse(llmRequest);
      
      return llmResponse.response || "I apologize, but I'm having trouble generating a response right now. Please try again.";

    } catch (error) {
      logger.error('Failed to generate chat response', { error, agentId: agent.id });
      return "I apologize, but I encountered an error while processing your message. Please try again.";
    }
  }

  private async respondToRequest(requestId: string, response: any): Promise<void> {
    await this.eventBusService.publish('agent.discussion.response', {
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
