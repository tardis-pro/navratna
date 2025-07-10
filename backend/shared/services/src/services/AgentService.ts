import { logger } from '@uaip/utils';
import { TypeOrmService } from '../typeormService';
import { AgentRepository } from '../database/repositories/AgentRepository';
import { CapabilityRepository } from '../database/repositories/CapabilityRepository';
import { Agent } from '../entities/agent.entity';
import { Capability } from '../entities/capability.entity';
import { AgentStatus, AgentRole, SecurityLevel } from '@uaip/types';
import { EventBusService } from '../eventBusService';

export class AgentService {
  private static instance: AgentService;
  private typeormService: TypeOrmService;

  // Core repositories
  private agentRepository: AgentRepository | null = null;
  private capabilityRepository: CapabilityRepository | null = null;
  private eventBusService: EventBusService | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

  private getEventBusService(): EventBusService {
    if (!this.eventBusService) {
      this.eventBusService = EventBusService.getInstance();
    }
    return this.eventBusService;
  }

  public static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  // Repository getters
  public getAgentRepository(): AgentRepository {
    if (!this.agentRepository) {
      this.agentRepository = new AgentRepository();
    }
    return this.agentRepository;
  }

  public getCapabilityRepository(): CapabilityRepository {
    if (!this.capabilityRepository) {
      this.capabilityRepository = new CapabilityRepository();
    }
    return this.capabilityRepository;
  }

  // Core agent operations
  public async createAgent(data: {
    name: string;
    displayName?: string;
    description?: string;
    role?: AgentRole;
    instructions?: string;
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    securityLevel?: SecurityLevel;
    status?: AgentStatus;
  }): Promise<Agent> {
    const agentRepo = this.getAgentRepository();
    return await agentRepo.create({
      ...data,
      role: data.role || AgentRole.ASSISTANT,
      modelId: data.modelId || 'gpt-4',
      temperature: data.temperature || 0.7,
      maxTokens: data.maxTokens || 4096,
      securityLevel: data.securityLevel || SecurityLevel.MEDIUM,
      status: data.status || AgentStatus.IDLE,
    });
  }

  public async findAgentById(id: string): Promise<Agent | null> {
    return await this.getAgentRepository().findById(id);
  }

  public async findAgentByName(name: string): Promise<Agent | null> {
    const agents = await this.getAgentRepository().findMany({ name });
    return agents.length > 0 ? agents[0] : null;
  }

  public async findActiveAgents(): Promise<Agent[]> {
    const idleAgents = await this.getAgentRepository().findMany({ status: AgentStatus.IDLE });
    const activeAgents = await this.getAgentRepository().findMany({ status: AgentStatus.ACTIVE });
    return [...idleAgents, ...activeAgents];
  }

  public async updateAgent(id: string, data: Partial<Agent>): Promise<Agent | null> {
    const originalAgent = await this.getAgentRepository().findById(id);
    if (!originalAgent) {
      return null;
    }

    const updatedAgent = await this.getAgentRepository().update(id, data);
    
    // Check if model or provider configuration changed
    if (updatedAgent && this.hasModelConfigChanged(originalAgent, updatedAgent)) {
      try {
        await this.publishAgentConfigChangeEvent(updatedAgent);
      } catch (error) {
        logger.error('Failed to publish agent config change event', { 
          agentId: id, 
          error: error.message 
        });
      }
    }
    
    return updatedAgent;
  }

  private hasModelConfigChanged(original: Agent, updated: Agent): boolean {
    return (
      original.modelId !== updated.modelId ||
      original.apiType !== updated.apiType ||
      original.userLLMProviderId !== updated.userLLMProviderId ||
      original.temperature !== updated.temperature ||
      original.maxTokens !== updated.maxTokens
    );
  }

  private async publishAgentConfigChangeEvent(agent: Agent): Promise<void> {
    const eventBus = this.getEventBusService();
    
    logger.info('Publishing agent configuration change event', {
      agentId: agent.id,
      modelId: agent.modelId,
      apiType: agent.apiType,
      userLLMProviderId: agent.userLLMProviderId
    });

    await eventBus.publish('agent.config.changed', {
      agentId: agent.id,
      modelId: agent.modelId,
      apiType: agent.apiType,
      userLLMProviderId: agent.userLLMProviderId,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      timestamp: new Date().toISOString()
    });

    // Also publish general provider change event for LLM service cache invalidation
    await eventBus.publish('llm.provider.changed', {
      eventType: 'agent-config-changed',
      agentId: agent.id,
      modelId: agent.modelId,
      apiType: agent.apiType,
      userLLMProviderId: agent.userLLMProviderId,
      timestamp: new Date().toISOString()
    });
  }

  public async updateAgentStatus(id: string, status: AgentStatus): Promise<boolean> {
    const result = await this.getAgentRepository().update(id, { status });
    return result !== null;
  }

  public async deleteAgent(id: string): Promise<boolean> {
    return await this.getAgentRepository().delete(id);
  }

  // Capability operations
  public async createCapability(data: {
    name: string;
    description?: string;
    category: string;
    isActive?: boolean;
  }): Promise<Capability> {
    const capabilityRepo = this.getCapabilityRepository();
    return await capabilityRepo.create({
      ...data,
      isActive: data.isActive ?? true
    });
  }

  public async findCapabilityById(id: string): Promise<Capability | null> {
    return await this.getCapabilityRepository().findById(id);
  }

  public async assignCapabilityToAgent(agentId: string, capabilityId: string): Promise<void> {
    const agent = await this.findAgentById(agentId);
    if (!agent) throw new Error('Agent not found');

    const capability = await this.getCapabilityRepository().findById(capabilityId);
    if (!capability) throw new Error('Capability not found');

    if (!agent.capabilities) {
      agent.capabilities = [];
    }

    // Check if already assigned
    const isAssigned = agent.capabilities.includes(capabilityId);
    if (!isAssigned) {
      agent.capabilities.push(capabilityId);
      await this.getAgentRepository().update(agent.id, { capabilities: agent.capabilities });
    }
  }

  public async removeCapabilityFromAgent(agentId: string, capabilityId: string): Promise<void> {
    const agent = await this.findAgentById(agentId);
    if (!agent) throw new Error('Agent not found');

    if (agent.capabilities) {
      agent.capabilities = agent.capabilities.filter(cap => cap !== capabilityId);
      await this.getAgentRepository().update(agent.id, { capabilities: agent.capabilities });
    }
  }

  // Bulk operations
  public async createBulkAgents(agents: Array<Partial<Agent>>): Promise<Agent[]> {
    const agentRepo = this.getAgentRepository();
    return await agentRepo.batchCreate(agents);
  }

  public async findAgentsByRole(role: AgentRole): Promise<Agent[]> {
    return await this.getAgentRepository().findMany({ role });
  }
}