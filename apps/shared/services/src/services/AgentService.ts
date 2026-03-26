import { logger } from '@uaip/utils';
import { BaseDomainService } from './BaseDomainService';
import { AgentRepository } from '../database/repositories/AgentRepository';
import { CapabilityRepository } from '../database/repositories/CapabilityRepository';
import { AgentLLMPreferenceRepository } from '../database/repositories/AgentLLMPreferenceRepository';
import { AgentStatus, AgentRole, SecurityLevel } from '@uaip/types';
import { EventBusService } from '../eventBusService';
import type { Agent } from '../database/drizzle/schemas/intelligence.schema';

interface Capability {
  id: string;
  name: string;
  description?: string;
  type: string;
  configuration?: Record<string, unknown>;
  isEnabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface AgentLLMPreference {
  id: string;
  agentId: string;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  preferences?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class AgentService extends BaseDomainService {
  protected constructor() {
    super();
  }

  private getEventBusService(): EventBusService {
    return this.getRepository('eventBus', () => EventBusService.getInstance());
  }

  public static getInstance(): AgentService {
    return BaseDomainService.resolve<AgentService>(AgentService);
  }

  public getAgentRepository(): AgentRepository {
    return this.getRepository('agentRepo', () => new AgentRepository());
  }

  public getCapabilityRepository(): CapabilityRepository {
    return this.getRepository('capabilityRepo', () => new CapabilityRepository());
  }

  public getAgentLLMPreferenceRepository(): AgentLLMPreferenceRepository {
    return this.getRepository('agentLLMPrefRepo', () => new AgentLLMPreferenceRepository());
  }

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
    const result = await agentRepo.create({
      name: data.name,
      description: data.description,
      role: data.role || AgentRole.ASSISTANT,
      systemPrompt: data.instructions,
      modelId: data.modelId || 'gpt-4',
      temperature: data.temperature || 0.7,
      maxTokens: data.maxTokens || 4096,
      securityLevel: data.securityLevel || SecurityLevel.MEDIUM,
      status: data.status || AgentStatus.IDLE,
      isActive: true,
      createdBy: 'system',
      version: '1.0.0',
      tags: [],
      capabilities: [],
      metadata: {},
    });
    return result as unknown as Agent;
  }

  public async findAgentById(id: string): Promise<Agent | null> {
    const result = await this.getAgentRepository().findById(id);
    return result as unknown as Agent | null;
  }

  public async findAgentByName(name: string): Promise<Agent | null> {
    const agents = await this.getAgentRepository().findMany({ name });
    return (agents[0] as unknown as Agent) || null;
  }

  public async findActiveAgents(): Promise<Agent[]> {
    const idleAgents = await this.getAgentRepository().findMany({ status: AgentStatus.IDLE });
    const activeAgents = await this.getAgentRepository().findMany({ status: AgentStatus.ACTIVE });
    return [...idleAgents, ...activeAgents] as unknown as Agent[];
  }

  public async updateAgent(id: string, data: Partial<Agent>): Promise<Agent | null> {
    const originalAgent = await this.getAgentRepository().findById(id);
    if (!originalAgent) {
      return null;
    }

    const updatedAgent = await this.getAgentRepository().update(
      id,
      data as Record<string, unknown>
    );

    if (
      updatedAgent &&
      this.hasModelConfigChanged(
        originalAgent as unknown as Agent,
        updatedAgent as unknown as Agent
      )
    ) {
      try {
        await this.publishAgentConfigChangeEvent(updatedAgent as unknown as Agent);
      } catch (error) {
        logger.error('Failed to publish agent config change event', {
          agentId: id,
          error: (error as Error).message,
        });
      }
    }

    return updatedAgent as unknown as Agent | null;
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
      userLLMProviderId: agent.userLLMProviderId,
    });

    await eventBus.publish('agent.config.changed', {
      agentId: agent.id,
      modelId: agent.modelId,
      apiType: agent.apiType,
      userLLMProviderId: agent.userLLMProviderId,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      timestamp: new Date().toISOString(),
    });

    await eventBus.publish('llm.provider.changed', {
      eventType: 'agent-config-changed',
      agentId: agent.id,
      modelId: agent.modelId,
      apiType: agent.apiType,
      userLLMProviderId: agent.userLLMProviderId,
      timestamp: new Date().toISOString(),
    });
  }

  public async updateAgentStatus(id: string, status: AgentStatus): Promise<boolean> {
    const result = await this.getAgentRepository().update(id, { status } as Record<
      string,
      unknown
    >);
    return result !== null;
  }

  public async deleteAgent(id: string): Promise<boolean> {
    return await this.getAgentRepository().delete(id);
  }

  public async createCapability(data: {
    name: string;
    description?: string;
    category: string;
    isActive?: boolean;
  }): Promise<Capability> {
    const capabilityRepo = this.getCapabilityRepository();
    const result = await capabilityRepo.create({
      name: data.name,
      description: data.description,
      type: data.category,
      isEnabled: data.isActive ?? true,
      metadata: {},
    });
    return result as unknown as Capability;
  }

  public async findCapabilityById(id: string): Promise<Capability | null> {
    const result = await this.getCapabilityRepository().findById(id);
    return result as unknown as Capability | null;
  }

  public async assignCapabilityToAgent(agentId: string, capabilityId: string): Promise<void> {
    const agent = await this.findAgentById(agentId);
    if (!agent) throw new Error('Agent not found');

    const capability = await this.getCapabilityRepository().findById(capabilityId);
    if (!capability) throw new Error('Capability not found');

    const agentCapabilities = (agent.capabilities || []) as string[];
    if (!agentCapabilities.includes(capabilityId)) {
      agentCapabilities.push(capabilityId);
      await this.getAgentRepository().update(agent.id, {
        capabilities: agentCapabilities,
      } as Record<string, unknown>);
    }
  }

  public async removeCapabilityFromAgent(agentId: string, capabilityId: string): Promise<void> {
    const agent = await this.findAgentById(agentId);
    if (!agent) throw new Error('Agent not found');

    const agentCapabilities = (agent.capabilities || []) as string[];
    const filtered = agentCapabilities.filter((cap) => cap !== capabilityId);
    await this.getAgentRepository().update(agent.id, { capabilities: filtered } as Record<
      string,
      unknown
    >);
  }

  public async createBulkAgents(agents: Array<Partial<Agent>>): Promise<Agent[]> {
    const agentRepo = this.getAgentRepository();
    const results = await agentRepo.batchCreate(agents as unknown as Record<string, unknown>[]);
    return results as unknown as Agent[];
  }

  public async findAgentsByRole(role: AgentRole): Promise<Agent[]> {
    const results = await this.getAgentRepository().findMany({ role: role as unknown as string });
    return results as unknown as Agent[];
  }
}
