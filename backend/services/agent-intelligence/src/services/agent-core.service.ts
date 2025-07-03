/**
 * Agent Core Service
 * Handles basic CRUD operations for agents
 * Part of the refactored agent-intelligence microservices
 */

import { Agent, AgentStatus, AgentRole, CreateAgentRequest, AgentIntelligenceConfig, AgentSecurityContext } from '@uaip/types';
import { logger } from '@uaip/utils';
import { DatabaseService, EventBusService, Repository, validateServiceAccess, AccessLevel } from '@uaip/shared-services';
import { config } from '@uaip/config';
import { v4 as uuidv4 } from 'uuid';

export interface AgentCoreConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  serviceName: string;
  securityLevel: number;
}

interface CreateCommandEvent {
  requestId: string;
  data: CreateAgentRequest;
  userId: string;
}

interface UpdateCommandEvent {
  requestId: string;
  agentId: string;
  data: Partial<CreateAgentRequest>;
  userId: string;
}

interface DeleteCommandEvent {
  requestId: string;
  agentId: string;
  userId: string;
}

interface GetQueryEvent {
  requestId: string;
  agentId: string;
}

interface ListQueryEvent {
  requestId: string;
  filters?: {
    limit?: number;
    offset?: number;
    role?: AgentRole;
    status?: AgentStatus;
    createdBy?: string;
  };
}

export class AgentCoreService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private serviceName: string;
  private securityLevel: number;
  private agentRepository: Repository<Agent>;

  constructor(config: AgentCoreConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;
  }

  async initialize(): Promise<void> {
    // Safely access enterprise configuration with fallback
    const enterpriseConfig = config.enterprise || { enabled: false, zeroTrustMode: false, serviceAccessMatrix: 'standard' };

    // Determine database instance name based on enterprise mode
    const databaseInstance = enterpriseConfig.enabled ? 'postgres-application' : 'postgres';
    const useEnterpriseMatrix = enterpriseConfig.enabled;

    // Validate database access using appropriate matrix
    if (!validateServiceAccess(this.serviceName, 'postgresql', databaseInstance, AccessLevel.WRITE, useEnterpriseMatrix)) {
      throw new Error(`Service lacks required database permissions for agents (instance: ${databaseInstance}, enterprise: ${useEnterpriseMatrix})`);
    }

    logger.debug('Database access validation passed', {
      service: this.serviceName,
      databaseInstance,
      enterpriseMode: enterpriseConfig.enabled,
      useEnterpriseMatrix,
      configAvailable: !!config.enterprise
    });

    // Initialize agent repository
    this.agentRepository = await this.databaseService.getRepository('Agent');

    // Set up event subscriptions
    await this.setupEventSubscriptions();

    logger.info('Agent Core Service initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel,
      environment: process.env.NODE_ENV,
      enterpriseMode: enterpriseConfig.enabled,
      databaseInstance
    });
  }

  /**
   * Set up event bus subscriptions for agent operations
   */
  private async setupEventSubscriptions(): Promise<void> {
    // Subscribe to agent commands
    await this.eventBusService.subscribe('agent.command.create', this.handleCreateCommand.bind(this));
    await this.eventBusService.subscribe('agent.command.update', this.handleUpdateCommand.bind(this));
    await this.eventBusService.subscribe('agent.command.delete', this.handleDeleteCommand.bind(this));

    // Subscribe to agent queries
    await this.eventBusService.subscribe('agent.query.get', this.handleGetQuery.bind(this));
    await this.eventBusService.subscribe('agent.query.list', this.handleListQuery.bind(this));
    await this.eventBusService.subscribe('agent.query.getWithPersona', this.handleGetWithPersonaQuery.bind(this));

    logger.info('Agent Core Service event subscriptions configured');
  }

  /**
   * Create a new agent
   */
  async createAgent(agentData: CreateAgentRequest, createdBy: string): Promise<Agent> {
    try {
      // Validate required fields
      this.validateAgentData(agentData);

      // Generate agent ID
      const agentId = uuidv4();

      // Create default intelligence config
      const defaultIntelligenceConfig = {
        analysisDepth: 'intermediate' as 'basic' | 'intermediate' | 'advanced',
        contextWindowSize: 4000,
        decisionThreshold: 0.7,
        learningEnabled: true,
        collaborationMode: 'collaborative' as 'independent' | 'collaborative' | 'supervised'
      };

      // Create default security context
      const defaultSecurityContext = {
        securityLevel: (agentData.securityLevel || 'medium') as 'low' | 'medium' | 'high' | 'critical',
        allowedCapabilities: agentData.capabilities || [],
        restrictedDomains: [],
        approvalRequired: false,
        auditLevel: 'standard' as 'minimal' | 'standard' | 'comprehensive'
      };

      const agent: Agent = {
        id: agentId,
        name: agentData.name,
        description: agentData.description || '',
        role: agentData.role || AgentRole.ASSISTANT,
        capabilities: agentData.capabilities || [],
        configuration: agentData.configuration || {},
        status: AgentStatus.ACTIVE,
        personaId: agentData.personaId!,
        intelligenceConfig: defaultIntelligenceConfig,
        securityContext: defaultSecurityContext,
        isActive: agentData.isActive !== undefined ? agentData.isActive : true,
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        // Model configuration fields from the request
        modelId: agentData.modelId,
        apiType: agentData.apiType,
        temperature: (agentData as any).temperature,
        maxTokens: (agentData as any).maxTokens,
        systemPrompt: (agentData as any).systemPrompt,
        // Additional optional fields
        metadata: {},
        lastActiveAt: undefined,
      };

      // Save to database
      const savedAgent = await this.agentRepository.save(agent);

      // Publish agent created event
      await this.publishAgentEvent('agent.event.created', {
        agent: savedAgent,
        createdBy,
        timestamp: new Date().toISOString()
      });

      this.auditLog('AGENT_CREATED', {
        agentId: savedAgent.id,
        name: savedAgent.name,
        role: savedAgent.role,
        createdBy
      });

      return savedAgent;
    } catch (error) {
      logger.error('Failed to create agent', { error, agentData });
      throw error;
    }
  }

  /**
   * Get an agent by ID
   */
  async getAgent(agentId: string): Promise<Agent | null> {
    try {
      this.validateID(agentId, 'agentId');

      const agent = await this.agentRepository.findOne({
        where: { id: agentId }
      });

      if (agent) {
        // Publish agent accessed event for analytics
        await this.publishAgentEvent('agent.event.accessed', {
          agentId,
          timestamp: new Date().toISOString()
        });
      }

      return agent;
    } catch (error) {
      logger.error('Failed to get agent', { error, agentId });
      throw error;
    }
  }

  /**
   * Get agent with persona data
   */
  async getAgentWithPersona(agentId: string): Promise<Agent & { personaData?: Record<string, unknown> } | null> {
    try {
      const agent = await this.getAgent(agentId);
      if (!agent) return null;

      if (agent.personaId) {
        // Request persona data through event bus
        const personaResponse = await this.requestPersonaData(agent.personaId);
        return {
          ...agent,
          personaData: personaResponse
        };
      }

      return agent;
    } catch (error) {
      logger.error('Failed to get agent with persona', { error, agentId });
      throw error;
    }
  }

  /**
   * List agents with optional filters
   */
  async getAgents(filters?: {
    limit?: number;
    offset?: number;
    role?: AgentRole;
    status?: AgentStatus;
    createdBy?: string;
  }): Promise<Agent[]> {
    try {
      const queryBuilder = this.agentRepository.createQueryBuilder('agent');

      // Apply filters
      if (filters?.role) {
        queryBuilder.andWhere('agent.role = :role', { role: filters.role });
      }
      if (filters?.status) {
        queryBuilder.andWhere('agent.status = :status', { status: filters.status });
      }
      if (filters?.createdBy) {
        queryBuilder.andWhere('agent.createdBy = :createdBy', { createdBy: filters.createdBy });
      }

      // Apply pagination
      if (filters?.offset) {
        queryBuilder.skip(filters.offset);
      }
      if (filters?.limit) {
        queryBuilder.take(filters.limit);
      }

      // Order by creation date
      queryBuilder.orderBy('agent.createdAt', 'DESC');

      const agents = await queryBuilder.getMany();

      // Publish list accessed event for analytics
      await this.publishAgentEvent('agent.event.listed', {
        count: agents.length,
        filters,
        timestamp: new Date().toISOString()
      });

      return agents;
    } catch (error) {
      logger.error('Failed to list agents', { error, filters });
      throw error;
    }
  }

  /**
   * Update an agent
   */
  async updateAgent(agentId: string, updateData: Partial<CreateAgentRequest>, updatedBy: string): Promise<Agent | null> {
    try {
      this.validateID(agentId, 'agentId');

      const existingAgent = await this.getAgent(agentId);
      if (!existingAgent) {
        return null;
      }

      // Prepare update data
      const updatePayload = {
        ...updateData,
        updatedAt: new Date(),
        version: existingAgent.version + 1,
      };

      // Update in database
      await this.agentRepository.update({ id: agentId }, updatePayload);

      // Get updated agent
      const updatedAgent = await this.getAgent(agentId);
      if (!updatedAgent) {
        throw new Error('Agent not found after update');
      }

      // Publish agent updated event
      await this.publishAgentEvent('agent.event.updated', {
        agent: updatedAgent,
        previousVersion: existingAgent.version,
        updatedBy,
        changes: Object.keys(updateData),
        timestamp: new Date().toISOString()
      });

      this.auditLog('AGENT_UPDATED', {
        agentId,
        updatedBy,
        changes: Object.keys(updateData)
      });

      return updatedAgent;
    } catch (error) {
      logger.error('Failed to update agent', { error, agentId, updateData });
      throw error;
    }
  }

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: string, deletedBy: string): Promise<void> {
    try {
      this.validateID(agentId, 'agentId');

      const agent = await this.getAgent(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Soft delete by updating status
      await this.agentRepository.update(
        { id: agentId },
        {
          status: AgentStatus.DELETED,
          deletedAt: new Date(),
          deletedBy,
          metadata: {
            ...agent.metadata,
            deletedFrom: this.serviceName
          }
        }
      );

      // Publish agent deleted event
      await this.publishAgentEvent('agent.event.deleted', {
        agentId,
        deletedBy,
        timestamp: new Date().toISOString()
      });

      this.auditLog('AGENT_DELETED', {
        agentId,
        deletedBy
      });
    } catch (error) {
      logger.error('Failed to delete agent', { error, agentId });
      throw error;
    }
  }

  /**
   * Event handlers
   */
  private async handleCreateCommand(event: CreateCommandEvent): Promise<void> {
    const { requestId, data, userId } = event;
    try {
      const agent = await this.createAgent(data, userId);
      await this.respondToRequest(requestId, { success: true, data: agent });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.respondToRequest(requestId, { success: false, error: errorMessage });
    }
  }

  private async handleUpdateCommand(event: UpdateCommandEvent): Promise<void> {
    const { requestId, agentId, data, userId } = event;
    try {
      const agent = await this.updateAgent(agentId, data, userId);
      await this.respondToRequest(requestId, { success: true, data: agent });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.respondToRequest(requestId, { success: false, error: errorMessage });
    }
  }

  private async handleDeleteCommand(event: DeleteCommandEvent): Promise<void> {
    const { requestId, agentId, userId } = event;
    try {
      await this.deleteAgent(agentId, userId);
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.respondToRequest(requestId, { success: false, error: errorMessage });
    }
  }

  private async handleGetQuery(event: GetQueryEvent): Promise<void> {
    const { requestId, agentId } = event;
    try {
      const agent = await this.getAgent(agentId);
      await this.respondToRequest(requestId, { success: true, data: agent });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.respondToRequest(requestId, { success: false, error: errorMessage });
    }
  }

  private async handleListQuery(event: ListQueryEvent): Promise<void> {
    const { requestId, filters } = event;
    try {
      const agents = await this.getAgents(filters);
      await this.respondToRequest(requestId, { success: true, data: agents });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.respondToRequest(requestId, { success: false, error: errorMessage });
    }
  }

  private async handleGetWithPersonaQuery(event: GetQueryEvent): Promise<void> {
    const { requestId, agentId } = event;
    try {
      const agent = await this.getAgentWithPersona(agentId);
      await this.respondToRequest(requestId, { success: true, data: agent });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.respondToRequest(requestId, { success: false, error: errorMessage });
    }
  }

  /**
   * Helper methods
   */
  private validateID(value: string, paramName: string): void {
    if (!value || typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Invalid ${paramName}: must be a non-empty string`);
    }
  }

  private validateAgentData(data: CreateAgentRequest): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Agent name is required');
    }
    if (!data.personaId) {
      throw new Error('Persona ID is required for agent creation');
    }
  }

  private async publishAgentEvent(channel: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: this.serviceName,
        securityLevel: this.securityLevel
      });
    } catch (error) {
      logger.error('Failed to publish agent event', { channel, error });
    }
  }

  private async respondToRequest(requestId: string, response: Record<string, unknown>): Promise<void> {
    await this.eventBusService.publish('agent.response', {
      requestId,
      ...response,
      timestamp: new Date().toISOString()
    });
  }

  private async requestPersonaData(personaId: string): Promise<Record<string, unknown> | null> {
    try {
      // Request persona data through event bus from persona service
      const requestId = uuidv4();
      const response = await this.eventBusService.request('persona.query.get', {
        requestId,
        personaId,
        source: this.serviceName
      });

      return response?.data || null;
    } catch (error) {
      logger.warn('Failed to fetch persona data', { personaId, error });
      return null;
    }
  }

  private auditLog(event: string, data: Record<string, unknown>): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true
    });
  }
}