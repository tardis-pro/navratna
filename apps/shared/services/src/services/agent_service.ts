import { logger } from '@uaip/utils';
import { BaseDomainService } from './base_domain_service';
import { AgentRepository, PersonaRepository } from '../database/repositories/agent_repository';
import { CapabilityRepository } from '../database/repositories/capability_repository';
import { AgentLLMPreferenceRepository } from '../database/repositories/agent_l_l_m_preference_repository';
import { AgentStatus, AgentRole, SecurityLevel } from '@uaip/types';
import { EventBusService } from '../event_bus_service';
import type { Agent } from '../database/drizzle/schemas/intelligence_schema';
import type { CapabilityRow } from '../database/repositories/capability_repository';

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

const toCapability = (row: CapabilityRow): Capability => ({
  id: row.id,
  name: row.name,
  description: row.description ?? undefined,
  type: row.type,
  configuration:
    row.configuration && typeof row.configuration === 'object'
      ? { ...row.configuration }
      : undefined,
  isEnabled: row.isEnabled,
  metadata:
    row.metadata && typeof row.metadata === 'object'
      ? { ...row.metadata }
      : undefined,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

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

  private getPersonaRepository(): PersonaRepository {
    return this.getRepository('personaRepo', () => new PersonaRepository());
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
    personaId?: string;
    intelligenceConfig?: Agent['intelligenceConfig'];
    securityContext?: Agent['securityContext'];
    createdBy?: string;
  }): Promise<Agent> {
    const agentRepo = this.getAgentRepository();
    const personaRepo = this.getPersonaRepository();
    const defaultPersona = await personaRepo.getOrCreateDefaultPersona();
    const result = await agentRepo.createAgent({
      name: data.name,
      description: data.description,
      role: data.role ?? AgentRole.ASSISTANT,
      personaId: data.personaId || defaultPersona.id,
      systemPrompt: data.instructions,
      modelId: data.modelId || 'gpt-4',
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      securityLevel: data.securityLevel ?? SecurityLevel.MEDIUM,
      status: data.status ?? AgentStatus.IDLE,
      isActive: true,
      createdBy: data.createdBy || 'system',
      version: '1.0.0',
      tags: [],
      capabilities: [],
      intelligenceConfig: data.intelligenceConfig ?? {},
      securityContext: data.securityContext ?? {},
    });
    return result;
  }

  public async findAgentById(id: string): Promise<Agent | null> {
    return this.getAgentRepository().findById(id);
  }

  public async findAgentByName(name: string): Promise<Agent | null> {
    const agents = await this.getAgentRepository().findMany({ status: AgentStatus.IDLE });
    return agents.find((a) => a.name === name) ?? null;
  }

  public async findActiveAgents(): Promise<Agent[]> {
    const idleAgents = await this.getAgentRepository().findMany({ isActive: true });
    return idleAgents;
  }

  public async updateAgent(id: string, data: Partial<Agent>): Promise<Agent | null> {
    const originalAgent = await this.getAgentRepository().findById(id);
    if (!originalAgent) {
      return null;
    }

    const updatedAgent = await this.getAgentRepository().updateAgent(
      id,
      data
    );

    if (
      updatedAgent &&
      this.hasModelConfigChanged(
        originalAgent,
        updatedAgent
      )
    ) {
      try {
        await this.publishAgentConfigChangeEvent(updatedAgent);
      } catch (error) {
        logger.error('Failed to publish agent config change event', {
          agentId: id,
          error: error instanceof Error ? error.message : String(error),
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
    const result = await this.getAgentRepository().updateAgent(id, { status });
    return result !== null;
  }

  public async deleteAgent(id: string): Promise<boolean> {
    return await this.getAgentRepository().deleteAgent(id);
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
    return toCapability(result);
  }

  public async findCapabilityById(id: string): Promise<Capability | null> {
    const result = await this.getCapabilityRepository().findById(id);
    return result ? toCapability(result) : null;
  }

  public async assignCapabilityToAgent(agentId: string, capabilityId: string): Promise<void> {
    const agent = await this.findAgentById(agentId);
    if (!agent) throw new Error('Agent not found');

    const capability = await this.getCapabilityRepository().findById(capabilityId);
    if (!capability) throw new Error('Capability not found');

    const agentCapabilities = agent.capabilities ?? [];
    if (!agentCapabilities.includes(capabilityId)) {
      agentCapabilities.push(capabilityId);
      await this.getAgentRepository().updateAgent(agent.id, { capabilities: agentCapabilities });
    }
  }

  public async removeCapabilityFromAgent(agentId: string, capabilityId: string): Promise<void> {
    const agent = await this.findAgentById(agentId);
    if (!agent) throw new Error('Agent not found');

    const agentCapabilities = agent.capabilities ?? [];
    const filtered = agentCapabilities.filter((cap) => cap !== capabilityId);
    await this.getAgentRepository().updateAgent(agent.id, { capabilities: filtered });
  }

  public async createBulkAgents(agents: Array<Partial<Agent>>): Promise<Agent[]> {
    const results: Agent[] = [];
    for (const agentData of agents) {
      const created = await this.createAgent({
        name: agentData.name ?? 'Agent',
        description: agentData.description,
        role: agentData.role,
        instructions: agentData.systemPrompt,
        modelId: agentData.modelId,
        temperature: agentData.temperature,
        maxTokens: agentData.maxTokens,
        personaId: agentData.personaId,
        intelligenceConfig: agentData.intelligenceConfig,
        securityContext: agentData.securityContext,
        createdBy: agentData.createdBy,
      });
      results.push(created);
    }
    return results;
  }

  public async findAgentsByRole(role: AgentRole): Promise<Agent[]> {
    const results = await this.getAgentRepository().findMany({ role });
    return results;
  }
}
