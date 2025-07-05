import { Repository, In } from 'typeorm';
import { logger } from '@uaip/utils/logger';
import { TypeOrmService } from '../typeormService';
import { AgentRepository } from '../database/repositories/AgentRepository';
import { CapabilityRepository } from '../database/repositories/CapabilityRepository';
import { Agent } from '../entities/agent.entity';
import { Persona } from '../entities/persona.entity';
import { AgentCapabilityMetric } from '../entities/agentCapabilityMetric.entity';
import { PersonaAnalytics } from '../entities/personaAnalytics.entity';
import { AgentOAuthConnectionEntity } from '../entities/agentOAuthConnection.entity';
import { ConversationContext } from '../entities/conversationContext.entity';
import { AgentCapability } from '../entities/agentCapability.entity';
import { AgentStatus, AgentRole, SecurityLevel } from '@uaip/types';

export class AgentService {
  private static instance: AgentService;
  private typeormService: TypeOrmService;
  
  // Repositories
  private agentRepository: AgentRepository | null = null;
  private personaRepository: Repository<Persona> | null = null;
  private capabilityRepository: CapabilityRepository | null = null;
  private agentCapabilityMetricRepository: Repository<AgentCapabilityMetric> | null = null;
  private personaAnalyticsRepository: Repository<PersonaAnalytics> | null = null;
  private agentOAuthConnectionRepository: Repository<AgentOAuthConnectionEntity> | null = null;
  private conversationContextRepository: Repository<ConversationContext> | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

  public static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  // Repository getters with lazy initialization
  public getAgentRepository(): AgentRepository {
    if (!this.agentRepository) {
      this.agentRepository = new AgentRepository(this.typeormService.dataSource, Agent);
    }
    return this.agentRepository;
  }

  public getPersonaRepository(): Repository<Persona> {
    if (!this.personaRepository) {
      this.personaRepository = this.typeormService.dataSource.getRepository(Persona);
    }
    return this.personaRepository;
  }

  public getCapabilityRepository(): CapabilityRepository {
    if (!this.capabilityRepository) {
      this.capabilityRepository = new CapabilityRepository(this.typeormService.dataSource, AgentCapability);
    }
    return this.capabilityRepository;
  }

  public getAgentCapabilityMetricRepository(): Repository<AgentCapabilityMetric> {
    if (!this.agentCapabilityMetricRepository) {
      this.agentCapabilityMetricRepository = this.typeormService.dataSource.getRepository(AgentCapabilityMetric);
    }
    return this.agentCapabilityMetricRepository;
  }

  public getPersonaAnalyticsRepository(): Repository<PersonaAnalytics> {
    if (!this.personaAnalyticsRepository) {
      this.personaAnalyticsRepository = this.typeormService.dataSource.getRepository(PersonaAnalytics);
    }
    return this.personaAnalyticsRepository;
  }

  public getAgentOAuthConnectionRepository(): Repository<AgentOAuthConnectionEntity> {
    if (!this.agentOAuthConnectionRepository) {
      this.agentOAuthConnectionRepository = this.typeormService.dataSource.getRepository(AgentOAuthConnectionEntity);
    }
    return this.agentOAuthConnectionRepository;
  }

  public getConversationContextRepository(): Repository<ConversationContext> {
    if (!this.conversationContextRepository) {
      this.conversationContextRepository = this.typeormService.dataSource.getRepository(ConversationContext);
    }
    return this.conversationContextRepository;
  }

  // Agent operations
  public async createAgent(data: {
    name: string;
    displayName: string;
    description?: string;
    type: string;
    role: AgentRole;
    modelProvider: string;
    modelName: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    configuration?: any;
    metadata?: any;
    securityLevel?: SecurityLevel;
    status?: AgentStatus;
    personaId?: string;
  }): Promise<Agent> {
    const agentRepo = this.getAgentRepository();
    const agent = agentRepo.create({
      ...data,
      temperature: data.temperature || 0.7,
      maxTokens: data.maxTokens || 4096,
      securityLevel: data.securityLevel || SecurityLevel.MEDIUM,
      status: data.status || AgentStatus.READY,
      persona: data.personaId ? { id: data.personaId } : undefined
    });

    return await agentRepo.save(agent);
  }

  public async findAgentById(id: string): Promise<Agent | null> {
    return await this.getAgentRepository().findOne({
      where: { id },
      relations: ['capabilities', 'toolAssignments', 'toolAssignments.tool', 'persona']
    });
  }

  public async findAgentByName(name: string): Promise<Agent | null> {
    return await this.getAgentRepository().findOne({
      where: { name },
      relations: ['capabilities', 'toolAssignments', 'toolAssignments.tool', 'persona']
    });
  }

  public async findActiveAgents(): Promise<Agent[]> {
    return await this.getAgentRepository().find({
      where: { status: In([AgentStatus.READY, AgentStatus.ACTIVE]) },
      relations: ['capabilities', 'persona']
    });
  }

  public async findAgentsByRole(role: AgentRole): Promise<Agent[]> {
    return await this.getAgentRepository().find({
      where: { role },
      relations: ['capabilities', 'persona']
    });
  }

  public async updateAgent(id: string, data: Partial<Agent>): Promise<Agent | null> {
    await this.getAgentRepository().update(id, data);
    return await this.findAgentById(id);
  }

  public async updateAgentStatus(id: string, status: AgentStatus): Promise<boolean> {
    const result = await this.getAgentRepository().update(id, { status });
    return result.affected !== 0;
  }

  public async deleteAgent(id: string): Promise<boolean> {
    const result = await this.getAgentRepository().delete(id);
    return result.affected !== 0;
  }

  // Capability operations
  public async createCapability(data: {
    name: string;
    description: string;
    category: string;
    isActive?: boolean;
    configuration?: any;
    requiredPermissions?: string[];
  }): Promise<AgentCapability> {
    const capabilityRepo = this.getCapabilityRepository();
    const capability = capabilityRepo.create({
      ...data,
      isActive: data.isActive ?? true
    });

    return await capabilityRepo.save(capability);
  }

  public async assignCapabilityToAgent(agentId: string, capabilityId: string): Promise<void> {
    const agent = await this.findAgentById(agentId);
    if (!agent) throw new Error('Agent not found');

    const capability = await this.getCapabilityRepository().findOne({ where: { id: capabilityId } });
    if (!capability) throw new Error('Capability not found');

    if (!agent.capabilities) {
      agent.capabilities = [];
    }

    // Check if already assigned
    const isAssigned = agent.capabilities.some(cap => cap.id === capabilityId);
    if (!isAssigned) {
      agent.capabilities.push(capability);
      await this.getAgentRepository().save(agent);
    }
  }

  public async removeCapabilityFromAgent(agentId: string, capabilityId: string): Promise<void> {
    const agent = await this.findAgentById(agentId);
    if (!agent) throw new Error('Agent not found');

    if (agent.capabilities) {
      agent.capabilities = agent.capabilities.filter(cap => cap.id !== capabilityId);
      await this.getAgentRepository().save(agent);
    }
  }

  // Persona operations
  public async createPersona(data: {
    name: string;
    description?: string;
    traits?: any;
    preferences?: any;
    constraints?: any;
    isActive?: boolean;
  }): Promise<Persona> {
    const personaRepo = this.getPersonaRepository();
    const persona = personaRepo.create({
      ...data,
      isActive: data.isActive ?? true
    });

    return await personaRepo.save(persona);
  }

  public async findPersonaById(id: string): Promise<Persona | null> {
    return await this.getPersonaRepository().findOne({ where: { id } });
  }

  public async updatePersona(id: string, data: Partial<Persona>): Promise<Persona | null> {
    await this.getPersonaRepository().update(id, data);
    return await this.findPersonaById(id);
  }

  // Conversation context operations
  public async createConversationContext(data: {
    agentId: string;
    conversationId: string;
    context: any;
    metadata?: any;
  }): Promise<ConversationContext> {
    const contextRepo = this.getConversationContextRepository();
    const context = contextRepo.create({
      agent: { id: data.agentId },
      conversationId: data.conversationId,
      context: data.context,
      metadata: data.metadata
    });

    return await contextRepo.save(context);
  }

  public async getConversationContext(agentId: string, conversationId: string): Promise<ConversationContext | null> {
    return await this.getConversationContextRepository().findOne({
      where: { agent: { id: agentId }, conversationId }
    });
  }

  public async updateConversationContext(id: string, context: any): Promise<void> {
    await this.getConversationContextRepository().update(id, { 
      context, 
      updatedAt: new Date() 
    });
  }

  // Metrics operations
  public async trackCapabilityMetric(data: {
    agentId: string;
    capabilityId: string;
    metricType: string;
    value: number;
    metadata?: any;
  }): Promise<AgentCapabilityMetric> {
    const metricRepo = this.getAgentCapabilityMetricRepository();
    const metric = metricRepo.create({
      agent: { id: data.agentId },
      capability: { id: data.capabilityId },
      metricType: data.metricType,
      value: data.value,
      metadata: data.metadata
    });

    return await metricRepo.save(metric);
  }

  public async getAgentMetrics(agentId: string, days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const metricRepo = this.getAgentCapabilityMetricRepository();
    const metrics = await metricRepo
      .createQueryBuilder('metric')
      .select('metric.capabilityId', 'capabilityId')
      .addSelect('metric.metricType', 'metricType')
      .addSelect('AVG(metric.value)', 'avgValue')
      .addSelect('COUNT(*)', 'count')
      .where('metric.agentId = :agentId', { agentId })
      .andWhere('metric.createdAt >= :startDate', { startDate })
      .groupBy('metric.capabilityId')
      .addGroupBy('metric.metricType')
      .getRawMany();

    return {
      agentId,
      period: `${days} days`,
      metrics
    };
  }

  // OAuth connection operations
  public async createOAuthConnection(data: {
    agentId: string;
    providerId: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    scope?: string;
    metadata?: any;
  }): Promise<AgentOAuthConnectionEntity> {
    const connectionRepo = this.getAgentOAuthConnectionRepository();
    const connection = connectionRepo.create({
      agent: { id: data.agentId },
      provider: { id: data.providerId },
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      scope: data.scope,
      metadata: data.metadata
    });

    return await connectionRepo.save(connection);
  }

  public async getAgentOAuthConnections(agentId: string): Promise<AgentOAuthConnectionEntity[]> {
    return await this.getAgentOAuthConnectionRepository().find({
      where: { agent: { id: agentId } },
      relations: ['provider']
    });
  }

  // Bulk operations
  public async createBulkAgents(agents: Array<Partial<Agent>>): Promise<Agent[]> {
    const agentRepo = this.getAgentRepository();
    const entities = agents.map(agent => agentRepo.create(agent));
    return await agentRepo.save(entities);
  }

  public async activateAgentsByRole(role: AgentRole): Promise<number> {
    const result = await this.getAgentRepository().update(
      { role, status: AgentStatus.INACTIVE },
      { status: AgentStatus.READY }
    );
    return result.affected || 0;
  }
}