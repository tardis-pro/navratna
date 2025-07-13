/**
 * Conversation Enhancement Service
 * 
 * Backend service that provides intelligent conversation enhancement
 * using shared conversation utilities. Handles persona selection,
 * contextual responses, and natural conversation flows.
 */

import { EventEmitter } from 'events';
import { logger } from '@uaip/utils';
import {
  Persona,
  Agent,
  Discussion,
  DiscussionParticipant
} from '@uaip/types';
import { DatabaseService, EventBusService, LLMRequestTracker } from '@uaip/shared-services';

// Local type definitions until they're properly exported from @uaip/types
interface ConversationContext {
  recentTopics: string[];
  speakerHistory: string[];
  keyPoints: Record<string, string[]>;
  conversationMomentum: 'building' | 'exploring' | 'deciding' | 'clarifying';
  lastSpeakerContribution: Record<string, string>;
  lastSpeakerContinuityCount: number;
  topicShiftDetected: boolean;
  overallTone: 'formal' | 'casual' | 'heated' | 'collaborative';
  emotionalContext: 'neutral' | 'excited' | 'concerned' | 'frustrated' | 'optimistic';
}

interface ConversationState {
  activePersonaId: string | null;
  lastSpeakerContinuityCount: number;
  recentContributors: string[];
  conversationEnergy: number;
  needsClarification: boolean;
  topicStability: 'stable' | 'shifting' | 'diverging';
}

interface MessageHistoryItem {
  id: string;
  speaker: string;
  content: string;
  timestamp: Date;
  responseType?: string;
  topic?: string;
}

interface ContributionScore {
  personaId: string;
  score: number;
  factors: {
    topicMatch: number;
    momentumMatch: number;
    chattinessFactor: number;
    continuityPenalty: number;
    energyBonus: number;
  };
}

type ResponseType = 'primary' | 'follow-up' | 'agreement' | 'concern' | 'transition' | 'clarification';

interface ResponseEnhancement {
  type: ResponseType;
  useTransition: boolean;
  useFiller: boolean;
  fillerType?: string;
  referenceMemory: boolean;
  addEmotionalReflection: boolean;
}

export interface ConversationEnhancementRequest {
  discussionId: string;
  availableAgents: Agent[];
  messageHistory: MessageHistoryItem[];
  currentTopic: string;
  conversationState?: ConversationState;
  participantId?: string;
  enhancementType?: 'auto' | 'manual' | 'triggered';
  context?: any;
}

export interface ConversationEnhancementResult {
  success: boolean;
  selectedAgent?: Agent;
  selectedPersona?: Persona;
  enhancedResponse?: string;
  contributionScores?: ContributionScore[];
  updatedState?: ConversationState;
  flowAnalysis?: any;
  suggestions?: string[];
  nextActions?: string[];
  error?: string;
}

export interface ConversationAnalysisRequest {
  discussionId: string;
  messageHistory: MessageHistoryItem[];
  conversationState: ConversationState;
  analysisType: 'flow' | 'insights' | 'health' | 'patterns';
}

export interface AgentPersonaMapping {
  agentId: string;
  personas: Persona[];
  isActive: boolean;
  context?: any;
}

export class ConversationEnhancementService extends EventEmitter {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private llmRequestTracker: LLMRequestTracker;
  private agentPersonaMappings: Map<string, AgentPersonaMapping> = new Map();
  private conversationStates: Map<string, ConversationState> = new Map();

  constructor(
    databaseService: DatabaseService,
    eventBusService: EventBusService
  ) {
    super();
    this.databaseService = databaseService;
    this.eventBusService = eventBusService;
    
    // Initialize Redis-based LLM request tracker
    this.llmRequestTracker = new LLMRequestTracker(
      'conversation-enhancement',
      30000 // 30 second timeout
    );

    this.initializeEventHandlers();
    this.setupLLMEventSubscriptions();
  }

  /**
   * Initialize the service and load agent-persona mappings
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Conversation Enhancement Service');

      // Load agent-persona mappings from database
      await this.loadAgentPersonaMappings();

      // Subscribe to agent and discussion events
      await this.setupEventSubscriptions();

      logger.info('Conversation Enhancement Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Conversation Enhancement Service', { error });
      throw error;
    }
  }

  /**
   * Set up LLM event subscriptions for event-driven LLM requests
   */
  private setupLLMEventSubscriptions(): void {
    // Handle user LLM responses (for discussion creator's provider)
    this.eventBusService.subscribe('llm.user.response', async (event) => {
      const { requestId, content, error, confidence } = event.data || event;
      this.handleLLMResponse(requestId, content, error, confidence, 'user');
    });

    // Handle agent LLM responses (fallback)
    this.eventBusService.subscribe('llm.agent.generate.response', async (event) => {
      const { requestId, content, error, confidence } = event.data || event;
      this.handleLLMResponse(requestId, content, error, confidence, 'agent');
    });

    logger.info('Conversation Enhancement LLM event subscriptions established');
  }

  private async handleLLMResponse(requestId: string, content: string, error: any, confidence: number, source: string): Promise<void> {
    const isPending = await this.llmRequestTracker.isPending(requestId);
    if (!isPending) {
      const pendingCount = await this.llmRequestTracker.getPendingCount();
      const pendingKeys = await this.llmRequestTracker.getPendingRequestIds();
      logger.warn('Received LLM response for unknown conversation enhancement request', { 
        requestId, 
        source,
        pendingCount,
        pendingKeys
      });
      return;
    }

    // Check if content contains error messages from LLM service
    const isErrorContent = content && (
      content.includes('I apologize, but I encountered an error') ||
      content.includes('I encountered an error while generating') ||
      content.includes('I encountered an error while processing') ||
      content.includes('check your provider configuration') ||
      content.includes('Please try again or check your provider')
    );

    if (error || isErrorContent) {
      logger.warn('LLM generation failed for conversation enhancement', { 
        requestId, 
        error, 
        source,
        isErrorContent,
        contentPreview: content?.substring(0, 100)
      });
      // Fail with graceful fallback
      await this.llmRequestTracker.completePendingRequest(requestId, {
        content: 'I appreciate the discussion and would like to contribute further.',
        confidence: 0.3
      });
    } else {
      await this.llmRequestTracker.completePendingRequest(requestId, {
        content: content || 'I have some thoughts on this topic.',
        confidence: confidence || 0.7
      });
    }
  }

  /**
   * Request LLM generation via events using discussion creator's provider
   */
  private async requestLLMGeneration(
    prompt: string,
    systemPrompt: string,
    temperature: number = 0.7,
    maxTokens: number = 300,
    discussionId?: string,
    agentId?: string
  ): Promise<{ content: string; confidence: number }> {
    return new Promise(async (resolve, reject) => {
      const requestId = `conv_enh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Add to Redis-based request tracker (45 seconds timeout)
      await this.llmRequestTracker.addPendingRequest(
        requestId,
        (response) => resolve(response),
        (error) => reject(error),
        45000,
        'conversation-enhancement'
      );

      try {
        // Get discussion creator's userId for LLM provider
        let userId = null;
        if (discussionId) {
          try {
            const discussionService = await this.databaseService.getDiscussionService();
            const discussion = await discussionService.getDiscussion(discussionId);
            if (discussion && discussion.createdBy) {
              userId = discussion.createdBy;
              logger.info('Found discussion creator for LLM provider', { 
                discussionId, 
                createdBy: userId,
                discussionTitle: discussion.title 
              });
            } else {
              logger.warn('No discussion creator found', { discussionId, discussion: !!discussion });
            }
          } catch (error) {
            logger.warn('Failed to get discussion creator for LLM provider', { discussionId, error: error.message });
          }
        } else {
          logger.warn('No discussionId provided for LLM generation');
        }

        // Use user's LLM provider if available, otherwise fallback to system
        if (userId) {
          // Create a basic agent structure for the request
          const agentData = {
            id: 'ai-agent',
            name: 'AI Assistant',
            persona: {
              description: 'An intelligent conversation participant'
            }
          };

          // Create minimal message history (empty for now)
          const formattedMessages = [];

          // Use user-specific LLM request with proper AgentResponseRequest structure
          await this.eventBusService.publish('llm.user.request', {
            requestId,
            userId,
            agentRequest: {
              agent: agentData,
              messages: formattedMessages,
              context: {
                id: discussionId || 'discussion',
                title: 'Discussion',
                content: `Topic: General discussion\n\nPrompt: ${prompt}\n\nSystem Instructions: ${systemPrompt}`,
                type: 'discussion'
              },
              tools: [] // Add tools if needed
            },
            service: 'agent-intelligence'
          });
        } else {
          // Fallback to agent-level LLM request
          await this.eventBusService.publish('llm.agent.generate.request', {
            requestId,
            agentId: agentId || null, // Use provided agentId or null for global fallback
            messages: [{
              role: 'user',
              content: prompt
            }],
            systemPrompt: systemPrompt,
            maxTokens: maxTokens,
            temperature: temperature,
            model: 'auto', // Let the system choose the model
            provider: 'auto', // Let the system choose the provider
            service: 'agent-intelligence'
          });
        }

        const pendingCount = await this.llmRequestTracker.getPendingCount();
        logger.debug('Conversation enhancement LLM request published', {
          requestId,
          pendingCount
        });

      } catch (error) {
        await this.llmRequestTracker.failPendingRequest(requestId, error);
      }
    });
  }

  /**
   * Get enhanced conversation contribution from an agent
   */
  async getEnhancedContribution(
    request: ConversationEnhancementRequest
  ): Promise<ConversationEnhancementResult> {
    try {
      logger.info('Processing conversation enhancement request', {
        discussionId: request.discussionId,
        agentCount: request.availableAgents.length,
        messageCount: request.messageHistory.length,
        enhancementType: request.enhancementType
      });

      // Get or initialize conversation state
      const conversationState = request.conversationState ||
        this.getConversationState(request.discussionId);

      // Map agents to personas
      const availablePersonas = await this.mapAgentsToPersonas(request.availableAgents);

      if (availablePersonas.length === 0) {
        return {
          success: false,
          error: 'No personas available for conversation enhancement'
        };
      }

      // Select best persona for contribution
      const selectedPersona = await this.selectBestPersona(
        availablePersonas,
        request.messageHistory,
        request.currentTopic,
        conversationState
      );

      if (!selectedPersona) {
        return {
          success: false,
          error: 'No suitable persona found for contribution'
        };
      }

      // Find the corresponding agent for the selected persona
      const selectedAgent = this.findAgentForPersona(
        request.availableAgents,
        selectedPersona
      );

      // Generate enhanced response using discussion creator's LLM provider
      const enhancedResponse = await this.generateEnhancedResponse(
        selectedPersona,
        request.currentTopic,
        request.messageHistory,
        conversationState,
        request.discussionId,
        selectedAgent?.id // Pass the agent ID for proper LLM routing
      );

      // Update conversation state
      const updatedState = this.updateConversationStateSimple(
        conversationState,
        selectedPersona.id
      );
      this.updateConversationState(request.discussionId, updatedState);

      // Analyze conversation flow
      const flowAnalysis = this.analyzeConversationFlowSimple(
        request.messageHistory
      );

      // Generate suggestions for improvement
      const suggestions = await this.generateConversationSuggestions(
        { selectedPersona, enhancedResponse },
        flowAnalysis,
        request
      );

      // Generate next action recommendations
      const nextActions = await this.generateNextActions(
        { selectedPersona, enhancedResponse },
        request
      );

      logger.info('Conversation enhancement completed successfully', {
        discussionId: request.discussionId,
        selectedAgentId: selectedAgent?.id,
        selectedPersonaId: selectedPersona?.id,
        flowQuality: flowAnalysis.flowQuality
      });

      return {
        success: true,
        selectedAgent,
        selectedPersona,
        enhancedResponse,
        contributionScores: [{ personaId: selectedPersona.id, score: 1.0, factors: { topicMatch: 1.0, momentumMatch: 1.0, chattinessFactor: 0.8, continuityPenalty: 0.0, energyBonus: 0.2 } }],
        updatedState,
        flowAnalysis,
        suggestions,
        nextActions
      };

    } catch (error) {
      logger.error('Failed to process conversation enhancement request', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: request.discussionId
      });

      return {
        success: false,
        error: 'Failed to enhance conversation'
      };
    }
  }

  /**
   * Analyze conversation patterns and health
   */
  async analyzeConversation(
    request: ConversationAnalysisRequest
  ): Promise<any> {
    try {
      const { messageHistory, conversationState, analysisType } = request;

      switch (analysisType) {
        case 'flow':
          return this.analyzeConversationFlow(messageHistory, []);

        case 'insights':
          return this.getConversationInsights(messageHistory, conversationState);

        case 'health':
          return this.analyzeConversationHealth(request);

        case 'patterns':
          return await this.analyzeConversationPatterns(request);

        default:
          throw new Error(`Unknown analysis type: ${analysisType}`);
      }
    } catch (error) {
      logger.error('Failed to analyze conversation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        discussionId: request.discussionId,
        analysisType: request.analysisType
      });
      throw error;
    }
  }

  /**
   * Create hybrid personas by cross-breeding existing ones
   */
  async createHybridPersona(
    persona1Id: string,
    persona2Id: string,
    hybridConfig?: any
  ): Promise<Persona> {
    try {
      // Get personas from agent mappings
      const persona1 = await this.getPersonaById(persona1Id);
      const persona2 = await this.getPersonaById(persona2Id);

      if (!persona1 || !persona2) {
        throw new Error('One or both personas not found');
      }

      // Use shared cross-breeding utility
      const hybridPersona = this.crossBreedPersonas(persona1, persona2, hybridConfig);

      // Store the hybrid persona
      await this.storeHybridPersona(hybridPersona);

      logger.info('Created hybrid persona', {
        hybridId: hybridPersona.id,
        parent1: persona1Id,
        parent2: persona2Id
      });

      return hybridPersona;
    } catch (error) {
      logger.error('Failed to create hybrid persona', {
        error: error instanceof Error ? error.message : 'Unknown error',
        persona1Id,
        persona2Id
      });
      throw error;
    }
  }

  /**
   * Generate contextual response for a specific agent/persona
   */
  async generateContextualResponse(
    agentId: string,
    personaId: string,
    context: ConversationContext,
    baseContent: string
  ): Promise<string> {
    try {
      const persona = await this.getPersonaById(personaId);
      if (!persona) {
        throw new Error(`Persona ${personaId} not found`);
      }

      // Determine response enhancement
      const responseEnhancement: ResponseEnhancement = {
        type: 'primary',
        useTransition: context.topicShiftDetected,
        useFiller: false, // pace property not available
        fillerType: this.determineFillerType(persona, context),
        referenceMemory: context.recentTopics.length > 2,
        addEmotionalReflection: typeof persona.conversationalStyle?.empathy === 'number' && persona.conversationalStyle.empathy > 0.7
      };

      // Generate enhanced response using async method  
      const enhancedResponse = await this.generateEnhancedResponse(
        persona,
        baseContent,
        [], // empty message history for now
        this.initializeConversationStateSimple(),
        undefined, // No discussionId for this context
        agentId
      );

      return enhancedResponse;
    } catch (error) {
      logger.error('Failed to generate contextual response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        agentId,
        personaId
      });
      throw error;
    }
  }

  /**
   * Process discussion participation event from orchestration service
   */
  async processDiscussionParticipation(event: any): Promise<void> {
    try {
      const { discussionId, agentId, participantId, discussionContext } = event;

      logger.info('Processing discussion participation event', {
        discussionId,
        agentId,
        participantId
      });

      // Get discussion data
      const discussion = await this.getDiscussionData(discussionId);
      if (!discussion) {
        logger.warn('Discussion not found for participation event', { discussionId });
        return;
      }

      // Get agent data
      const agent = await this.databaseService.getAgentService().findAgentById(agentId);
      if (!agent) {
        logger.warn('Agent not found for participation event', { agentId });
        return;
      }

      // Create message history from discussion
      const messageHistory = await this.createMessageHistoryFromDiscussion(discussion);

      // Get conversation state
      const conversationState = this.getConversationState(discussionId);

      // Request enhanced contribution
      const enhancementResult = await this.getEnhancedContribution({
        discussionId,
        availableAgents: [agent as any],
        messageHistory,
        currentTopic: discussionContext?.topic || discussion.topic,
        conversationState,
        participantId,
        enhancementType: 'triggered',
        context: discussionContext
      });

      if (enhancementResult.success && enhancementResult.enhancedResponse) {
        // Send the enhanced response via discussion orchestration
        await this.eventBusService.publish('discussion.message.send', {
          discussionId,
          participantId,
          content: enhancementResult.enhancedResponse,
          messageType: 'agent_contribution',
          metadata: {
            agentId,
            personaId: enhancementResult.selectedPersona?.id,
            enhancementType: 'contextual',
            contributionScore: enhancementResult.contributionScores?.[0]?.score
          }
        });

        logger.info('Enhanced response sent to discussion', {
          discussionId,
          agentId,
          personaId: enhancementResult.selectedPersona?.id,
          responseLength: enhancementResult.enhancedResponse.length
        });
      }

    } catch (error) {
      logger.error('Failed to process discussion participation event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        event
      });
    }
  }

  // Private helper methods

  private async loadAgentPersonaMappings(): Promise<void> {
    try {
      // Load all active agents
      const agents = await this.databaseService.getAgentService().findActiveAgents();

      for (const agent of agents) {
        // Map agent properties to personas
        const personas = await this.createPersonasFromAgent(agent as any);

        this.agentPersonaMappings.set(agent.id, {
          agentId: agent.id,
          personas,
          isActive: true,
          context: {
            role: agent.role,
            capabilities: agent.capabilities,
            metadata: agent.metadata
          }
        });
      }

      logger.info('Loaded agent-persona mappings', {
        agentCount: agents.length,
        totalPersonas: Array.from(this.agentPersonaMappings.values())
          .reduce((sum, mapping) => sum + mapping.personas.length, 0)
      });
    } catch (error) {
      logger.error('Failed to load agent-persona mappings', { error });
      throw error;
    }
  }

  private async createPersonasFromAgent(agent: Agent): Promise<Persona[]> {
    // Convert agent properties to persona format
    // This could be enhanced to support multiple personas per agent
    const basePersona: Persona = {
      id: `${agent.id}-primary`,
      name: agent.name,
      description: agent.description,
      role: agent.role,
      conversationalStyle: {
        tone: agent.metadata?.tone || 'professional',
        // pace: agent.metadata?.pace || 'moderate', // removed due to type mismatch
        formality: agent.metadata?.formality || 'formal',
        empathy: agent.metadata?.empathy || 'medium',
        // humor: agent.metadata?.humor || 'subtle', // removed due to type mismatch
        assertiveness: agent.metadata?.assertiveness || 'balanced'
      },
      expertise: this.convertCapabilitiesToExpertise(agent.capabilities || []),
      background: agent.metadata?.background || '',
      // perspective: agent.metadata?.perspective || agent.description, // removed due to type mismatch
      // Legacy properties for compatibility removed due to type mismatches
      // empathyLevel: this.convertEmpathyLevel(agent.metadata?.empathy),
      // energyLevel: this.convertEnergyLevel(agent.metadata?.pace),
      // tone: agent.metadata?.tone || 'professional'
    };

    // Could generate additional personas based on agent configuration
    return [basePersona];
  }

  private convertEmpathyLevel(empathy?: string): number {
    switch (empathy) {
      case 'high': return 0.8;
      case 'medium': return 0.5;
      case 'low': return 0.2;
      default: return 0.5;
    }
  }

  private convertEnergyLevel(pace?: string): 'low' | 'medium' | 'high' {
    switch (pace) {
      case 'relaxed': return 'low';
      case 'moderate': return 'medium';
      case 'energetic': return 'high';
      default: return 'medium';
    }
  }

  private async mapAgentsToPersonas(agents: Agent[]): Promise<Persona[]> {
    const personas: Persona[] = [];

    for (const agent of agents) {
      const mapping = this.agentPersonaMappings.get(agent.id);
      if (mapping && mapping.isActive) {
        personas.push(...mapping.personas);
      }
    }

    return personas;
  }

  private findAgentForPersona(agents: Agent[], persona: Persona): Agent | undefined {
    return agents.find(agent =>
      this.agentPersonaMappings.get(agent.id)?.personas
        .some(p => p.id === persona.id)
    );
  }

  private getConversationState(discussionId: string): ConversationState {
    if (!this.conversationStates.has(discussionId)) {
      this.conversationStates.set(discussionId, this.initializeConversationStateSimple());
    }
    return this.conversationStates.get(discussionId)!;
  }

  private updateConversationState(discussionId: string, state: ConversationState): void {
    this.conversationStates.set(discussionId, state);
  }

  private determineFillerType(
    persona: Persona,
    context: ConversationContext
  ): 'thinking' | 'hesitation' | 'transition' | 'agreement' | 'casual' {
    if (context.topicShiftDetected) return 'transition';
    if (typeof persona.conversationalStyle?.assertiveness === 'string' && persona.conversationalStyle.assertiveness === 'cautious') return 'hesitation';
    // if (persona.conversationalStyle?.pace === 'relaxed') return 'thinking'; // removed due to type mismatch
    return 'casual';
  }

  private async generateConversationSuggestions(
    enhancement: any,
    flowAnalysis: any,
    request: ConversationEnhancementRequest
  ): Promise<string[]> {
    const suggestions: string[] = [];

    if (flowAnalysis.flowQuality < 0.7) {
      suggestions.push('Consider encouraging more diverse participation');
    }

    if (flowAnalysis.diversityScore < 0.5) {
      suggestions.push('Invite more perspectives to enrich the discussion');
    }

    if (enhancement.contributionScores && enhancement.contributionScores.every((score: ContributionScore) => score.score < 1.5)) {
      suggestions.push('Discussion energy is low - consider introducing new topics');
    }

    return suggestions;
  }

  private async generateNextActions(
    enhancement: any,
    request: ConversationEnhancementRequest
  ): Promise<string[]> {
    const actions: string[] = [];

    if (enhancement.selectedPersona.role === 'moderator') {
      actions.push('Consider summarizing key points discussed');
      actions.push('Ask for consensus on decisions made');
    }

    if (request.enhancementType === 'auto') {
      actions.push('Monitor for natural conversation breaks');
      actions.push('Prepare follow-up questions');
    }

    return actions;
  }

  private async analyzeConversationHealth(request: ConversationAnalysisRequest): Promise<any> {
    // Implement conversation health analysis
    return {
      healthScore: 0.8,
      issues: [],
      recommendations: []
    };
  }

  private async analyzeConversationPatterns(request: ConversationAnalysisRequest): Promise<any> {
    // Use analyzeConversationFlow function from shared types
    return this.analyzeConversationFlow(request.messageHistory, []);
  }

  private async getPersonaById(personaId: string): Promise<Persona | null> {
    for (const mapping of this.agentPersonaMappings.values()) {
      const persona = mapping.personas.find(p => p.id === personaId);
      if (persona) return persona;
    }
    return null;
  }

  private async storeHybridPersona(persona: Persona): Promise<void> {
    // Store hybrid persona in database or cache
    // Implementation depends on your storage strategy
    logger.info('Storing hybrid persona', { personaId: persona.id });
  }

  // Public methods for routes
  public async getAgentsByIds(agentIds: string[]): Promise<Agent[]> {
    const agents: Agent[] = [];
    for (const agentId of agentIds) {
      try {
        const agent = await this.databaseService.getAgentService().findAgentById(agentId);
        if (agent) {
          agents.push(agent as any);
        }
      } catch (error) {
        logger.warn('Failed to get agent for enhancement', { agentId, error });
      }
    }
    return agents;
  }

  public async getAgentById(agentId: string): Promise<Agent | null> {
    try {
      const agent = await this.databaseService.getAgentService().findAgentById(agentId);
      return agent as any;
    } catch (error) {
      logger.error('Failed to get agent by ID', { agentId, error });
      return null;
    }
  }

  public async getDiscussion(discussionId: string): Promise<Discussion | null> {
    return this.getDiscussionData(discussionId);
  }

  private async getDiscussionData(discussionId: string): Promise<Discussion | null> {
    try {
      const discussionService = await this.databaseService.getDiscussionService();
      return await discussionService.getDiscussion(discussionId);
    } catch (error) {
      logger.error('Failed to get discussion data', { error, discussionId });
      return null;
    }
  }

  private async createMessageHistoryFromDiscussion(discussion: Discussion): Promise<MessageHistoryItem[]> {
    try {
      const discussionService = await this.databaseService.getDiscussionService();
      const messages = await discussionService.getDiscussionMessages(discussion.id);

      // Get full discussion with participants to map IDs to names
      const fullDiscussion = await discussionService.getDiscussion(discussion.id);
      const participantMap = new Map();

      if (fullDiscussion && fullDiscussion.participants) {
        for (const participant of fullDiscussion.participants) {
          try {
            // Try to get agent name first
            if (participant.agentId) {
              const agent = await this.databaseService.getAgentService().findAgentById(participant.agentId);
              if (agent) {
                participantMap.set(participant.id, agent.name);
                continue;
              }
            }

            // Fallback to user name if available
            if (participant.userId) {
              const user = await this.databaseService.findById('User', participant.userId) as any;
              if (user && (user.username || user.email)) {
                participantMap.set(participant.id, user.username || user.email);
                continue;
              }
            }

            // Final fallback to participant ID
            participantMap.set(participant.id, participant.id);
          } catch (error) {
            logger.warn('Failed to get participant name', { participantId: participant.id, error });
            participantMap.set(participant.id, participant.id);
          }
        }
      }

      return messages.map(msg => ({
        id: msg.id,
        speaker: participantMap.get(msg.participantId) || msg.participantId || 'user',
        content: msg.content,
        timestamp: msg.createdAt,
        metadata: msg.metadata
      }));
    } catch (error) {
      logger.error('Failed to create message history', { error, discussionId: discussion.id });
      return [];
    }
  }

  private async setupEventSubscriptions(): Promise<void> {
    // Subscribe to discussion participation events
    await this.eventBusService.subscribe(
      'agent.discussion.participate',
      this.processDiscussionParticipation.bind(this)
    );

    // Subscribe to agent updates
    await this.eventBusService.subscribe(
      'agent.updated',
      this.handleAgentUpdate.bind(this)
    );

    logger.info('Conversation enhancement event subscriptions set up');
  }

  private async handleAgentUpdate(event: any): Promise<void> {
    try {
      const { agentId } = event;

      // Reload personas for updated agent
      const agent = await this.databaseService.getAgentService().findAgentById(agentId);
      if (agent) {
        const personas = await this.createPersonasFromAgent(agent as any);
        this.agentPersonaMappings.set(agentId, {
          agentId,
          personas,
          isActive: true,
          context: {
            role: agent.role,
            capabilities: agent.capabilities,
            metadata: agent.metadata
          }
        });

        logger.info('Updated agent-persona mapping', { agentId });
      }
    } catch (error) {
      logger.error('Failed to handle agent update', { error, event });
    }
  }

  private initializeEventHandlers(): void {
    this.on('error', (error) => {
      logger.error('Conversation Enhancement Service error', { error });
    });
  }

  /**
   * Select the best persona for contribution based on simple scoring
   */
  private async selectBestPersona(
    personas: Persona[],
    messageHistory: MessageHistoryItem[],
    currentTopic: string,
    conversationState: ConversationState
  ): Promise<Persona | null> {
    if (personas.length === 0) return null;

    // Simple selection logic - could be enhanced with more sophisticated scoring
    // For now, rotate through personas or select based on role
    const recentSpeakers = messageHistory.slice(-3).map(m => m.speaker);

    // Avoid selecting the same persona that spoke recently
    const availablePersonas = personas.filter(p =>
      !recentSpeakers.includes(p.id)
    );

    if (availablePersonas.length > 0) {
      // Select first available persona (could be randomized or scored)
      return availablePersonas[0];
    }

    // If all personas spoke recently, select the first one
    return personas[0];
  }

  /**
   * Generate enhanced response using LLM
   */
  private async generateEnhancedResponse(
    persona: Persona,
    topic: string,
    messageHistory: MessageHistoryItem[],
    conversationState: ConversationState,
    discussionId?: string,
    agentId?: string
  ): Promise<string> {
    try {
      // Create context from recent messages
      const recentMessages = messageHistory.slice(-5);
      const context = recentMessages.map(m => `${m.speaker}: ${m.content}`).join('\n');

      // Create persona-specific prompt
      const systemPrompt = `You are ${persona.name}. ${persona.description}
      
Role: ${persona.role}
Conversational Style: ${JSON.stringify(persona.conversationalStyle)}
Background: ${persona.background}
Perspective: ${persona.background}

Respond naturally to the conversation about "${topic}" considering your role and personality.`;

      const userPrompt = `Recent conversation:
${context}

Please contribute to this discussion about "${topic}" in a way that's natural and valuable to the conversation.`;

      // Generate response using event-driven LLM approach with discussion creator's provider
      const response = await this.requestLLMGeneration(
        userPrompt,
        systemPrompt,
        0.7,
        300,
        discussionId,
        agentId
      );

      return response.content || 'I have some thoughts on this topic, but I need a moment to organize them.';
    } catch (error) {
      logger.error('Failed to generate enhanced response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        personaId: persona.id
      });
      return 'I appreciate the discussion and would like to contribute further.';
    }
  }

  /**
   * Update conversation state simply
   */
  private updateConversationStateSimple(
    state: ConversationState,
    personaId: string
  ): ConversationState {
    return {
      ...state,
      activePersonaId: personaId,
      lastSpeakerContinuityCount: state.activePersonaId === personaId ?
        state.lastSpeakerContinuityCount + 1 : 0,
      recentContributors: [
        personaId,
        ...state.recentContributors.filter(id => id !== personaId)
      ].slice(0, 5),
      conversationEnergy: Math.min(1.0, state.conversationEnergy + 0.1)
    };
  }

  /**
   * Analyze conversation flow with simple metrics
   */
  private analyzeConversationFlowSimple(messageHistory: MessageHistoryItem[]): any {
    const recentSpeakers = messageHistory.slice(-5).map(m => m.speaker);
    const uniqueSpeakers = new Set(recentSpeakers);
    const diversityScore = uniqueSpeakers.size / Math.min(5, recentSpeakers.length);

    // Check for back-to-back speakers
    let backToBackCount = 0;
    for (let i = 1; i < recentSpeakers.length; i++) {
      if (recentSpeakers[i] === recentSpeakers[i - 1]) {
        backToBackCount++;
      }
    }

    const flowQuality = Math.max(0, 1 - (backToBackCount * 0.2));

    return {
      flowQuality,
      diversityScore,
      suggestions: diversityScore < 0.4 ?
        ['Consider encouraging more diverse participation'] : []
    };
  }

  /**
   * Initialize conversation state
   */
  private initializeConversationStateSimple(): ConversationState {
    return {
      activePersonaId: null,
      lastSpeakerContinuityCount: 0,
      recentContributors: [],
      conversationEnergy: 0.5,
      needsClarification: false,
      topicStability: 'stable'
    };
  }

  /**
   * Missing helper methods
   */
  private analyzeConversationFlow(messageHistory: any[], agents: any[]): any {
    return this.analyzeConversationFlowSimple(messageHistory);
  }

  private getConversationInsights(messageHistory: any[], conversationState: any): any {
    return {
      insights: ['This conversation has good flow'],
      patterns: [],
      suggestions: ['Continue the current topic']
    };
  }

  private crossBreedPersonas(persona1: any, persona2: any, config: any): any {
    // Simple hybrid persona creation
    return {
      ...persona1,
      id: `hybrid-${persona1.id}-${persona2.id}`,
      name: `${persona1.name} + ${persona2.name}`,
      description: `Hybrid of ${persona1.name} and ${persona2.name}`,
      conversationalStyle: {
        ...persona1.conversationalStyle,
        ...persona2.conversationalStyle
      }
    };
  }


  private convertCapabilitiesToExpertise(capabilities: string[]): any[] {
    return capabilities.map(cap => ({
      id: cap,
      name: cap,
      description: `Expertise in ${cap}`,
      category: 'general',
      keywords: [cap],
      level: 'intermediate',
      relatedDomains: []
    }));
  }

  // Note: Cleanup is now handled automatically by Redis TTL and LLMRequestTracker

  /**
   * Get service statistics for monitoring
   */
  public async getServiceStatistics(): Promise<{
    pendingLLMRequests: number;
    agentPersonaMappings: number;
    conversationStates: number;
  }> {
    const pendingLLMRequests = await this.llmRequestTracker.getPendingCount();
    return {
      pendingLLMRequests,
      agentPersonaMappings: this.agentPersonaMappings.size,
      conversationStates: this.conversationStates.size
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Shutdown Redis-based LLM request tracker
    await this.llmRequestTracker.shutdown();
    
    // Clear in-memory maps
    this.agentPersonaMappings.clear();
    this.conversationStates.clear();
    
    // Remove event listeners
    this.removeAllListeners();
    
    logger.info('Conversation Enhancement Service cleanup completed');
  }
}