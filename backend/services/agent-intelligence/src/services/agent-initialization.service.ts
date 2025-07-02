/**
 * Agent Initialization Service
 * Handles agent state management and initialization
 * Part of the refactored agent-intelligence microservices
 */

import { Agent, AgentState } from '@uaip/types';
import { logger } from '@uaip/utils';
import {
  DatabaseService,
  EventBusService,
  KnowledgeGraphService,
  AgentMemoryService,
  PersonaService
} from '@uaip/shared-services';

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

  constructor(config: AgentInitializationConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.knowledgeGraphService = config.knowledgeGraphService;
    this.agentMemoryService = config.agentMemoryService;
    this.personaService = config.personaService;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;
  }

  async initialize(): Promise<void> {
    // Set up event subscriptions
    await this.setupEventSubscriptions();

    logger.info('Agent Initialization Service initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel
    });
  }

  /**
   * Set up event bus subscriptions for initialization operations
   */
  private async setupEventSubscriptions(): Promise<void> {
    await this.eventBusService.subscribe('agent.initialization.initialize', this.handleInitializeAgent.bind(this));
    await this.eventBusService.subscribe('agent.initialization.setup', this.handleSetupAgentState.bind(this));
    await this.eventBusService.subscribe('agent.initialization.configure', this.handleConfigureCapabilities.bind(this));
    await this.eventBusService.subscribe('agent.initialization.environment', this.handleAnalyzeEnvironment.bind(this));

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
          logger.warn('Failed to get persona, continuing with basic initialization', { error, personaId });
        }
      }

      // Initialize knowledge context if available
      if (this.knowledgeGraphService && persona) {
        try {
          await this.knowledgeGraphService.initializeAgentContext(agentId, {
            expertise: persona.expertise || [],
            interests: persona.interests || [],
            background: persona.background || ''
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
        capabilities: persona?.expertise?.map(e => e.name) || [],
        performance: {
          responseTime: 0,
          successRate: 1.0,
          lastActivity: new Date()
        },
        context: {
          currentDiscussions: [],
          activeOperations: [],
          recentInteractions: []
        }
      };

      // Store initial state
      await this.storeAgentState(agentId, agentState);

      // Publish agent initialized event
      await this.publishInitializationEvent('agent.initialized', {
        agentId,
        personaId,
        capabilities: agentState.capabilities,
        memoryEnabled: !!this.agentMemoryService,
        knowledgeEnabled: !!this.knowledgeGraphService
      });

      this.auditLog('AGENT_INITIALIZED', {
        agentId,
        personaId,
        capabilitiesCount: agentState.capabilities.length
      });

      return agentState;
    } catch (error) {
      logger.error('Failed to initialize agent', { error, agentId, personaId });
      throw new Error(`Failed to initialize agent: ${error.message}`);
    }
  }

  /**
   * Setup agent state with comprehensive configuration
   */
  async setupAgentState(
    agentId: string,
    configuration: any,
    environmentFactors?: EnvironmentFactors
  ): Promise<AgentState> {
    try {
      this.validateID(agentId, 'agentId');

      logger.info('Setting up agent state', { agentId, configuration });

      // Get current agent data
      const agent = await this.getAgentData(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
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
          lastActivity: new Date()
        },
        context: {
          currentDiscussions: [],
          activeOperations: [],
          recentInteractions: [],
        }
      };

      // Initialize memory context if available
      if (this.agentMemoryService) {
        try {
          await this.agentMemoryService.updateWorkingMemory(agentId, {
            agentState: {
              status: agentState.status,
              capabilities: agentState.capabilities,
              lastSetup: new Date()
            }
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
        environment: environment.systemLoad
      });

      this.auditLog('AGENT_STATE_SETUP', {
        agentId,
        status: agentState.status,
        capabilitiesCount: agentState.capabilities.length
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
  async configureAgentCapabilities(agent: Agent, requirements?: any): Promise<AgentCapabilities> {
    try {
      logger.info('Configuring agent capabilities', { agentId: agent.id, requirements });

      const capabilities: AgentCapabilities = {
        tools: agent.intelligenceConfig?.collaborationMode || 'collaborative',
        artifacts: agent.intelligenceConfig?.analysisDepth || 'intermediate',
        specializations: agent.persona?.capabilities || [],
        limitations: agent.securityContext?.restrictedDomains || [],
        knowledgeAccess: !!this.knowledgeGraphService,
        memoryEnabled: !!this.agentMemoryService
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
          capabilities.specializations = [
            ...capabilities.specializations,
            ...requirements.specializations
          ];
        }
      }

      // Validate capabilities against security constraints
      if (agent.securityContext?.maxCapabilities) {
        capabilities.specializations = capabilities.specializations.slice(0, agent.securityContext.maxCapabilities);
      }

      // Store capabilities configuration
      await this.storeAgentCapabilities(agent.id, capabilities);

      // Publish capabilities configured event
      await this.publishInitializationEvent('agent.capabilities.configured', {
        agentId: agent.id,
        capabilities,
        knowledgeAccess: capabilities.knowledgeAccess,
        memoryEnabled: capabilities.memoryEnabled
      });

      this.auditLog('AGENT_CAPABILITIES_CONFIGURED', {
        agentId: agent.id,
        specializationsCount: capabilities.specializations.length,
        limitationsCount: capabilities.limitations.length
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
  analyzeEnvironmentFactors(conversationContext: any): EnvironmentFactors {
    return {
      timeOfDay: new Date().getHours(),
      userLoad: conversationContext.participants?.length || 1,
      systemLoad: this.assessSystemLoad(),
      availableResources: this.assessAvailableResources(),
      knowledgeGraphStatus: this.knowledgeGraphService ? 'active' : 'inactive',
      memorySystemStatus: this.agentMemoryService ? 'active' : 'inactive'
    };
  }

  /**
   * Event handlers
   */
  private async handleInitializeAgent(event: any): Promise<void> {
    const { requestId, agentId, personaId } = event;
    try {
      const agentState = await this.initializeAgent(agentId, personaId);
      await this.respondToRequest(requestId, { success: true, data: agentState });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleSetupAgentState(event: any): Promise<void> {
    const { requestId, agentId, configuration, environmentFactors } = event;
    try {
      const agentState = await this.setupAgentState(agentId, configuration, environmentFactors);
      await this.respondToRequest(requestId, { success: true, data: agentState });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleConfigureCapabilities(event: any): Promise<void> {
    const { requestId, agent, requirements } = event;
    try {
      const capabilities = await this.configureAgentCapabilities(agent, requirements);
      await this.respondToRequest(requestId, { success: true, data: capabilities });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleAnalyzeEnvironment(event: any): Promise<void> {
    const { requestId, conversationContext } = event;
    try {
      const environment = this.analyzeEnvironmentFactors(conversationContext);
      await this.respondToRequest(requestId, { success: true, data: environment });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
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
      memoryEnabled: !!this.agentMemoryService
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
      await this.databaseService.storeAgentState(agentId, {
        status: agentState.status,
        capabilities: agentState.capabilities,
        performance: agentState.performance,
        context: agentState.context,
        timestamp: new Date()
      });
    } catch (error) {
      logger.warn('Failed to store agent state', { error, agentId });
    }
  }

  private async storeAgentCapabilities(agentId: string, capabilities: AgentCapabilities): Promise<void> {
    try {
      await this.databaseService.storeAgentCapabilities(agentId, {
        capabilities,
        timestamp: new Date()
      });
    } catch (error) {
      logger.warn('Failed to store agent capabilities', { error, agentId });
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

  private validateID(value: string, paramName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Invalid ${paramName}: must be a non-empty string`);
    }
  }

  private async publishInitializationEvent(channel: string, data: any): Promise<void> {
    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: this.serviceName,
        securityLevel: this.securityLevel,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to publish initialization event', { channel, error });
    }
  }

  private async respondToRequest(requestId: string, response: any): Promise<void> {
    await this.eventBusService.publish('agent.initialization.response', {
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
