/**
 * Agent Initialization Service
 * Handles agent state management and initialization
 * Part of the refactored agent-intelligence microservices
 */

import { Agent, AgentState } from '@uaip/types';
import { logger, InternalServerError, NotFoundError, ValidationError } from '@uaip/utils';
import { PersonaService } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/event_bus';
import { AgentIntelligenceStore } from './agent_intelligence_store.js';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge_graph_service.js';
import { AgentMemoryService } from '../agent-memory/agent_memory_service.js';

export interface AgentInitializationConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  knowledgeGraphService?: KnowledgeGraphService;
  agentMemoryService?: AgentMemoryService;
  personaService?: PersonaService;
  serviceName: string;
  securityLevel: number;
}

export interface AgentCapabilities {
  tools: string;
  artifacts: string;
  specializations: string[];
  limitations: string[];
  knowledgeAccess: boolean;
  memoryEnabled: boolean;
}

export interface EnvironmentFactors {
  timeOfDay: number;
  userLoad: number;
  systemLoad: string;
  availableResources: string;
  knowledgeGraphStatus: string;
  memorySystemStatus: string;
}

export class AgentInitializationService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private knowledgeGraphService?: KnowledgeGraphService;
  private agentMemoryService?: AgentMemoryService;
  private personaService?: PersonaService;
  private serviceName: string;
  private securityLevel: number;
  private store: AgentIntelligenceStore;

  constructor(config: AgentInitializationConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.knowledgeGraphService = config.knowledgeGraphService;
    this.agentMemoryService = config.agentMemoryService;
    this.personaService = config.personaService;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;
    this.store = new AgentIntelligenceStore();
  }

  async initialize(): Promise<void> {
    // Set up event subscriptions
    await this.setupEventSubscriptions();

    logger.info('Agent Initialization Service initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel,
    });
  }

  /**
   * Set up event bus subscriptions for initialization operations
   */
  private async setupEventSubscriptions(): Promise<void> {
    await this.eventBusService.subscribe(
      'agent.initialization.initialize',
      this.handleInitializeAgent.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.initialization.setup',
      this.handleSetupAgentState.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.initialization.configure',
      this.handleConfigureCapabilities.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.initialization.environment',
      this.handleAnalyzeEnvironment.bind(this)
    );

    logger.info('Agent Initialization Service event subscriptions configured');
  }

  /**
   * Initialize an agent with Knowledge Graph and Memory capabilities
   */
  async initializeAgent(agentId: string, personaId: string): Promise<AgentState> {
    try {
      this.validateID(agentId, 'agentId');
      this.validateID(personaId, 'personaId');

      logger.info('Initializing agent with enhanced capabilities', { agentId, personaId });

      // Initialize working memory if available
      if (this.agentMemoryService) {
        const sessionId = `session-${Date.now()}`;
        await this.agentMemoryService.initializeWorkingMemory(agentId, sessionId);
        logger.info('Working memory initialized', { agentId, sessionId });
      }

      // Get persona information for context
      let persona = null;
      if (this.personaService) {
        try {
          persona = await this.personaService.getPersona(personaId);
        } catch (error) {
          logger.warn('Failed to get persona, continuing with basic initialization', {
            error,
            personaId,
          });
        }
      }

      // Initialize knowledge context if available
      if (this.knowledgeGraphService && persona) {
        try {
          await this.knowledgeGraphService.initializeAgentContext(agentId, {
            expertise: persona.expertise || [],
            interests: (persona as Record<string, unknown>).interests || [],
            background: persona.background || '',
          });
          logger.info('Knowledge context initialized', { agentId });
        } catch (error) {
          logger.warn('Failed to initialize knowledge context', { error, agentId });
        }
      }

      // Create agent state
      const agentState: AgentState = {
        agentId,
        status: 'active',
        capabilities: persona?.expertise?.map((e) => e.name) || [],
        performance: {
          responseTime: 0,
          successRate: 1.0,
          lastActivity: new Date(),
        },
        context: {
          currentDiscussions: [],
          activeOperations: [],
          recentInteractions: [],
        },
      };

      // Store initial state
      await this.storeAgentState(agentId, agentState);

      // Publish agent initialized event
      await this.publishInitializationEvent('agent.initialized', {
        agentId,
        personaId,
        capabilities: agentState.capabilities,
        memoryEnabled: !!this.agentMemoryService,
        knowledgeEnabled: !!this.knowledgeGraphService,
      });

      this.auditLog('AGENT_INITIALIZED', {
        agentId,
        personaId,
        capabilitiesCount: agentState.capabilities.length,
      });

      return agentState;
    } catch (error) {
      logger.error('Failed to initialize agent', { error, agentId, personaId });
      throw new InternalServerError(`Failed to initialize agent: ${error.message}`, { cause: error });
    }
  }

  /**
   * Setup agent state with comprehensive configuration
   */
  async setupAgentState(
    agentId: string,
    configuration: Record<string, unknown>,
    environmentFactors?: EnvironmentFactors
  ): Promise<AgentState> {
    try {
      this.validateID(agentId, 'agentId');

      logger.info('Setting up agent state', { agentId, configuration });

      // Get current agent data
      const agent = await this.getAgentData(agentId);
      if (!agent) {
        throw new NotFoundError(`Agent not found: ${agentId}`);
      }

      // Extract agent capabilities
      const capabilities = this.extractAgentCapabilities(agent);

      // Analyze environment if not provided
      const environment = environmentFactors || this.analyzeEnvironmentFactors({});

      // Create comprehensive agent state
      const agentState: AgentState = {
        agentId,
        status: 'active',
        capabilities: capabilities.specializations,
        performance: {
          responseTime: 0,
          successRate: 1.0,
          lastActivity: new Date(),
        },
        context: {
          currentDiscussions: [],
          activeOperations: [],
          recentInteractions: [],
        },
      };

      // Initialize memory context if available
      if (this.agentMemoryService) {
        try {
          await this.agentMemoryService.updateWorkingMemory(agentId, {
            agentState: {
              status: agentState.status,
              capabilities: agentState.capabilities,
              lastSetup: new Date(),
            },
          });
        } catch (error) {
          logger.warn('Failed to update working memory during setup', { error, agentId });
        }
      }

      // Store the state
      await this.storeAgentState(agentId, agentState);

      // Publish state setup event
      await this.publishInitializationEvent('agent.state.setup', {
        agentId,
        status: agentState.status,
        capabilitiesCount: agentState.capabilities.length,
        environment: environment.systemLoad,
      });

      this.auditLog('AGENT_STATE_SETUP', {
        agentId,
        status: agentState.status,
        capabilitiesCount: agentState.capabilities.length,
      });

      return agentState;
    } catch (error) {
      logger.error('Failed to setup agent state', { error, agentId });
      throw error;
    }
  }

  /**
   * Configure agent capabilities based on persona and requirements
   */
  async configureAgentCapabilities(
    agent: Agent,
    requirements?: Record<string, unknown>
  ): Promise<AgentCapabilities> {
    try {
      logger.info('Configuring agent capabilities', { agentId: agent.id, requirements });

      const capabilities: AgentCapabilities = {
        tools: agent.intelligenceConfig?.collaborationMode || 'collaborative',
        artifacts: agent.intelligenceConfig?.analysisDepth || 'intermediate',
        specializations: agent.persona?.capabilities || [],
        limitations: agent.securityContext?.restrictedDomains || [],
        knowledgeAccess: !!this.knowledgeGraphService,
        memoryEnabled: !!this.agentMemoryService,
      };

      // Apply requirements-based modifications
      if (requirements) {
        if (requirements.enhancedAnalysis) {
          capabilities.artifacts = 'advanced';
        }
        if (requirements.restrictedMode) {
          capabilities.tools = 'restricted';
          capabilities.limitations.push('restricted-mode');
        }
        if (requirements.specializations) {
          const extraSpecs = Array.isArray(requirements.specializations)
            ? (requirements.specializations as string[])
            : [];
          capabilities.specializations = [...capabilities.specializations, ...extraSpecs];
        }
      }

      // Validate capabilities against security constraints
      if (agent.securityContext?.maxCapabilities) {
        capabilities.specializations = capabilities.specializations.slice(
          0,
          agent.securityContext.maxCapabilities
        );
      }

      // Store capabilities configuration
      await this.storeAgentCapabilities(agent.id, capabilities);

      // Publish capabilities configured event
      await this.publishInitializationEvent('agent.capabilities.configured', {
        agentId: agent.id,
        capabilities,
        knowledgeAccess: capabilities.knowledgeAccess,
        memoryEnabled: capabilities.memoryEnabled,
      });

      this.auditLog('AGENT_CAPABILITIES_CONFIGURED', {
        agentId: agent.id,
        specializationsCount: capabilities.specializations.length,
        limitationsCount: capabilities.limitations.length,
      });

      return capabilities;
    } catch (error) {
      logger.error('Failed to configure agent capabilities', { error, agentId: agent.id });
      throw error;
    }
  }

  /**
   * Analyze environment factors for agent initialization
   */
  analyzeEnvironmentFactors(conversationContext: Record<string, unknown>): EnvironmentFactors {
    return {
      timeOfDay: new Date().getHours(),
      userLoad: Array.isArray(conversationContext.participants)
        ? conversationContext.participants.length
        : 1,
      systemLoad: this.assessSystemLoad(),
      availableResources: this.assessAvailableResources(),
      knowledgeGraphStatus: this.knowledgeGraphService ? 'active' : 'inactive',
      memorySystemStatus: this.agentMemoryService ? 'active' : 'inactive',
    };
  }

  /**
   * Event handlers
   */
  private async handleInitializeAgent(event: Record<string, unknown>): Promise<void> {
    const requestId = event.requestId as string;
    const agentId = event.agentId as string;
    const personaId = event.personaId as string | undefined;
    try {
      const agentState = await this.initializeAgent(agentId, personaId);
      await this.respondToRequest(requestId, { success: true, data: agentState });
    } catch (error) {
      await this.respondToRequest(requestId, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleSetupAgentState(event: Record<string, unknown>): Promise<void> {
    const requestId = event.requestId as string;
    const agentId = event.agentId as string;
    const configuration = (event.configuration ?? {}) as Record<string, unknown>;
    const environmentFactors = event.environmentFactors as EnvironmentFactors | undefined;
    try {
      const agentState = await this.setupAgentState(agentId, configuration, environmentFactors);
      await this.respondToRequest(requestId, { success: true, data: agentState });
    } catch (error) {
      await this.respondToRequest(requestId, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleConfigureCapabilities(event: Record<string, unknown>): Promise<void> {
    const requestId = event.requestId as string;
    const agent = event.agent as Agent;
    const requirements = (event.requirements ?? {}) as Record<string, unknown>;
    try {
      const capabilities = await this.configureAgentCapabilities(agent, requirements);
      await this.respondToRequest(requestId, { success: true, data: capabilities });
    } catch (error) {
      await this.respondToRequest(requestId, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleAnalyzeEnvironment(event: Record<string, unknown>): Promise<void> {
    const requestId = event.requestId as string;
    const conversationContext = (event.conversationContext ?? {}) as Record<string, unknown>;
    try {
      const environment = this.analyzeEnvironmentFactors(conversationContext);
      await this.respondToRequest(requestId, { success: true, data: environment });
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
  private extractAgentCapabilities(agent: Agent): AgentCapabilities {
    return {
      tools: agent.intelligenceConfig?.collaborationMode || 'collaborative',
      artifacts: agent.intelligenceConfig?.analysisDepth || 'intermediate',
      specializations: agent.persona?.capabilities || [],
      limitations: agent.securityContext?.restrictedDomains || [],
      knowledgeAccess: !!this.knowledgeGraphService,
      memoryEnabled: !!this.agentMemoryService,
    };
  }

  private assessSystemLoad(): string {
    // In a real implementation, this would check actual system metrics
    const currentHour = new Date().getHours();

    // Simulate higher load during business hours
    if (currentHour >= 9 && currentHour <= 17) {
      return Math.random() > 0.7 ? 'high' : 'normal';
    } else {
      return Math.random() > 0.9 ? 'normal' : 'low';
    }
  }

  private assessAvailableResources(): string {
    // In a real implementation, this would check actual resource availability
    const memoryUsage = Math.random();
    const cpuUsage = Math.random();

    if (memoryUsage > 0.8 || cpuUsage > 0.8) {
      return 'low';
    } else if (memoryUsage > 0.6 || cpuUsage > 0.6) {
      return 'medium';
    } else {
      return 'high';
    }
  }

  private async storeAgentState(agentId: string, agentState: AgentState): Promise<void> {
    try {
      await this.store.storeAgentState(agentId, {
        status: agentState.status,
        capabilities: agentState.capabilities,
        performance: agentState.performance,
        context: agentState.context,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.warn('Failed to store agent state', { error, agentId });
    }
  }

  private async storeAgentCapabilities(
    agentId: string,
    capabilities: AgentCapabilities
  ): Promise<void> {
    try {
      await this.store.storeAgentCapabilities(agentId, {
        capabilities: {
          primary: capabilities.specializations,
          scores: {},
        },
        timestamp: new Date(),
      });
    } catch (error) {
      logger.warn('Failed to store agent capabilities', { error, agentId });
    }
  }

  private async getAgentData(agentId: string): Promise<Agent | null> {
    try {
      const response = await this.eventBusService.request('agent.query.get', { agentId });
      const typed = response as { success?: boolean; data?: Agent } | null;
      return typed?.success ? (typed.data ?? null) : null;
    } catch (error) {
      logger.warn('Failed to get agent data', { error, agentId });
      return null;
    }
  }

  private validateID(value: string, paramName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new ValidationError(`Invalid ${paramName}: must be a non-empty string`);
    }
  }

  private async publishInitializationEvent(
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
      logger.error('Failed to publish initialization event', { channel, error });
    }
  }

  private async respondToRequest(
    requestId: string,
    response: Record<string, unknown>
  ): Promise<void> {
    await this.eventBusService.publish('agent.initialization.response', {
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
