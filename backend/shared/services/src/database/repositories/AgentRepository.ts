import { logger } from '@uaip/utils';
import { BaseRepository } from '../base/BaseRepository.js';
import { Agent } from '../../entities/agent.entity.js';

export class AgentRepository extends BaseRepository<Agent> {
  constructor() {
    super(Agent);
  }

  /**
   * Get all active agents with limit - includes persona relation
   */
  public async getActiveAgents(limit?: number): Promise<Agent[]> {
    try {
      const queryBuilder = this.repository.createQueryBuilder('agent')
        .leftJoinAndSelect('agent.persona', 'persona')
        .where('agent.isActive = :isActive', { isActive: true })
        .orderBy('agent.createdAt', 'DESC');

      if (limit) {
        queryBuilder.limit(limit);
      }

      const agents = await queryBuilder.getMany();
      
      // Ensure all agents have proper configuration
      agents.forEach(agent => {
        if (!agent.configuration || Object.keys(agent.configuration).length === 0) {
          agent.configuration = {
            model: 'gpt-3.5-turbo',
            temperature: 0.7,
            analysisDepth: 'intermediate',
            contextWindowSize: 4000,
            decisionThreshold: 0.7,
            learningEnabled: true,
            collaborationMode: 'collaborative'
          };
        }
      });
      
      return agents;
    } catch (error) {
      logger.error('Error getting active agents', { limit, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get agent by ID with active status check - includes persona relation
   */
  public async getActiveAgentById(agentId: string): Promise<Agent | null> {
    try {
      const agent = await this.repository.findOne({
        where: { id: agentId, isActive: true },
        relations: ['persona']
      });

      // Only set default configuration if configuration is completely null/undefined
      // Don't override if it's an empty object - that's a valid state
      if (agent && agent.configuration === null || agent.configuration === undefined) {
        agent.configuration = {
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          analysisDepth: 'intermediate',
          contextWindowSize: 4000,
          decisionThreshold: 0.7,
          learningEnabled: true,
          collaborationMode: 'collaborative'
        };
      }

      return agent;
    } catch (error) {
      logger.error('Error getting active agent by ID', { agentId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Create a new agent
   * COMPOSITION MODEL: Agent → Persona
   */
  public async createAgent(agentData: {
    id?: string;
    name: string;
    role: string;
    // COMPOSITION MODEL: personaId reference
    personaId?: string;
    // Legacy persona data for backwards compatibility
    legacyPersona?: any;
    // Deprecated: old persona field (for backwards compatibility)
    persona?: any;
    intelligenceConfig: any;
    securityContext: any;
    configuration?: any;
    // Model configuration fields
    modelId?: string;
    apiType?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    createdBy?: string;
    capabilities?: string[];
  }): Promise<Agent> {
    try {
      // Handle backwards compatibility: if old persona field is provided, use it as legacyPersona
      const finalPersonaId = agentData.personaId;
      let finalLegacyPersona = agentData.legacyPersona;
      
      if (agentData.persona && !agentData.legacyPersona) {
        finalLegacyPersona = agentData.persona;
        logger.warn('Using deprecated persona field as legacyPersona', { agentName: agentData.name });
      }

      const agent = this.repository.create({
        id: agentData.id,
        name: agentData.name,
        role: agentData.role as any,
        // COMPOSITION MODEL: Use personaId and legacyPersona
        personaId: finalPersonaId,
        legacyPersona: finalLegacyPersona,
        intelligenceConfig: agentData.intelligenceConfig,
        securityContext: agentData.securityContext,
        configuration: agentData.configuration,
        // Model configuration fields
        modelId: agentData.modelId,
        apiType: agentData.apiType as any,
        temperature: agentData.temperature,
        maxTokens: agentData.maxTokens,
        systemPrompt: agentData.systemPrompt,
        capabilities: agentData.capabilities || [],
        isActive: true,
        createdBy: agentData.createdBy
      });

      const savedAgent = await this.repository.save(agent);
      
      // Ensure configuration is not null/empty
      if (!savedAgent.configuration || Object.keys(savedAgent.configuration).length === 0) {
        savedAgent.configuration = {
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          analysisDepth: 'intermediate',
          contextWindowSize: 4000,
          decisionThreshold: 0.7,
          learningEnabled: true,
          collaborationMode: 'collaborative'
        };
      }

      logger.info('Agent created with composition model', { 
        agentId: savedAgent.id, 
        personaId: savedAgent.personaId,
        hasLegacyPersona: !!savedAgent.legacyPersona,
        hasConfiguration: !!savedAgent.configuration,
        configurationKeys: Object.keys(savedAgent.configuration)
      });
      
      return savedAgent;
    } catch (error) {
      logger.error('Error creating agent', { agentData, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Update an agent
   * COMPOSITION MODEL: Agent → Persona
   */
  public async updateAgent(agentId: string, updateData: {
    name?: string;
    role?: string;
    // COMPOSITION MODEL: personaId reference
    personaId?: string;
    // Legacy persona data for backwards compatibility
    legacyPersona?: any;
    // Deprecated: old persona field (for backwards compatibility)
    persona?: any;
    intelligenceConfig?: any;
    securityContext?: any;
    configuration?: any;
    capabilities?: string[];
    // Model configuration fields
    modelId?: string;
    apiType?: 'ollama' | 'llmstudio';
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  }): Promise<Agent | null> {
    try {
      // Prepare the update payload with proper typing
      const updatePayload: any = {
        updatedAt: new Date()
      };

      if (updateData.name !== undefined) updatePayload.name = updateData.name;
      if (updateData.role !== undefined) updatePayload.role = updateData.role as any;
      
      // COMPOSITION MODEL: Handle personaId and legacyPersona
      if (updateData.personaId !== undefined) updatePayload.personaId = updateData.personaId;
      if (updateData.legacyPersona !== undefined) updatePayload.legacyPersona = updateData.legacyPersona;
      
      // Handle backwards compatibility: if old persona field is provided, use it as legacyPersona
      if (updateData.persona !== undefined && updateData.legacyPersona === undefined) {
        updatePayload.legacyPersona = updateData.persona;
        logger.warn('Using deprecated persona field as legacyPersona in update', { agentId });
      }
      
      if (updateData.intelligenceConfig !== undefined) updatePayload.intelligenceConfig = updateData.intelligenceConfig;
      if (updateData.securityContext !== undefined) updatePayload.securityContext = updateData.securityContext;
      if (updateData.configuration !== undefined) updatePayload.configuration = updateData.configuration;
      if (updateData.capabilities !== undefined) updatePayload.capabilities = updateData.capabilities;

      // Handle model configuration fields
      if (updateData.modelId !== undefined) updatePayload.modelId = updateData.modelId;
      if (updateData.apiType !== undefined) updatePayload.apiType = updateData.apiType;
      if (updateData.temperature !== undefined) updatePayload.temperature = updateData.temperature;
      if (updateData.maxTokens !== undefined) updatePayload.maxTokens = updateData.maxTokens;
      if (updateData.systemPrompt !== undefined) updatePayload.systemPrompt = updateData.systemPrompt;

      const updateResult = await this.repository.update(
        { id: agentId, isActive: true },
        updatePayload
      );

      if (updateResult.affected === 0) {
        return null;
      }

      // Return the updated agent with persona relation
      const updatedAgent = await this.repository.findOne({
        where: { id: agentId, isActive: true },
        relations: ['persona']
      });

      if (updatedAgent) {
        // Ensure configuration is not null/empty
        if (!updatedAgent.configuration || Object.keys(updatedAgent.configuration).length === 0) {
          updatedAgent.configuration = {
            model: 'gpt-3.5-turbo',
            temperature: 0.7,
            analysisDepth: 'intermediate',
            contextWindowSize: 4000,
            decisionThreshold: 0.7,
            learningEnabled: true,
            collaborationMode: 'collaborative'
          };
        }

        logger.info('Agent updated with composition model', { 
          agentId: updatedAgent.id, 
          personaId: updatedAgent.personaId,
          hasLegacyPersona: !!updatedAgent.legacyPersona,
          hasConfiguration: !!updatedAgent.configuration,
          configurationKeys: Object.keys(updatedAgent.configuration),
          modelId: updatedAgent.modelId,
          apiType: updatedAgent.apiType
        });
      }

      return updatedAgent;
    } catch (error) {
      logger.error('Error updating agent', { agentId, updateData, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Deactivate an agent (set is_active to false)
   */
  public async deactivateAgent(agentId: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ 
        isActive: false, 
        updatedAt: new Date() 
      })
      .where('id = :agentId', { agentId })
      .andWhere('isActive = :isActive', { isActive: true })
      .execute();

    return (result.affected) > 0;
  }

  /**
   * Store execution plan
   */
  public async storeExecutionPlan(planData: {
    id: string;
    type: string;
    agentId: string;
    plan?: any;
    steps?: any;
    dependencies?: any;
    estimatedDuration?: number;
    priority?: string;
    constraints?: any;
    metadata?: any;
    context?: any;
    createdAt: Date;
  }): Promise<void> {
    try {
      const manager = this.getEntityManager();
      
      // Check if this is for operations table or execution_plans table
      if (planData.plan) {
        // Store in operations table (for AgentIntelligenceService)
        const query = `
          INSERT INTO operations (id, type, status, agent_id, plan, context, created_at)
          VALUES ($1, $2, 'planned', $3, $4, $5, $6)
        `;
        
        await manager.query(query, [
          planData.id,
          planData.type,
          planData.agentId,
          JSON.stringify(planData.plan),
          JSON.stringify(planData.context || planData.metadata),
          planData.createdAt
        ]);
      } else {
        // Store in execution_plans table (for agent intelligence services)
        const query = `
          INSERT INTO execution_plans (
            id, type, agent_id, steps, dependencies, estimated_duration,
            priority, constraints, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;
        
        await manager.query(query, [
          planData.id,
          planData.type,
          planData.agentId,
          JSON.stringify(planData.steps),
          JSON.stringify(planData.dependencies),
          planData.estimatedDuration,
          planData.priority,
          JSON.stringify(planData.constraints),
          JSON.stringify(planData.metadata),
          planData.createdAt
        ]);
      }
    } catch (error) {
      logger.error('Error storing execution plan', { planData, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get operation by ID
   */
  public async getOperationById(operationId: string): Promise<any | null> {
    try {
      const manager = this.getEntityManager();
      
      const query = `
        SELECT id, type, status, agent_id, plan, context, created_at, updated_at
        FROM operations 
        WHERE id = $1
      `;
      
      const result = await manager.query(query, [operationId]);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      logger.error('Error getting operation by ID', { operationId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Store enhanced learning record
   */
  public async storeEnhancedLearningRecord(recordData: {
    agentId: string;
    operationId: string;
    learningData: any;
    confidenceAdjustments: any;
  }): Promise<void> {
    const manager = this.getEntityManager();
    
    const query = `
      INSERT INTO agent_learning_records (
        agent_id, operation_id, learning_data, confidence_adjustments, created_at
      ) VALUES (
        $1, $2, $3, $4, NOW()
      )
    `;
    
    await manager.query(query, [
      recordData.agentId,
      recordData.operationId,
      JSON.stringify(recordData.learningData),
      JSON.stringify(recordData.confidenceAdjustments)
    ]);
  }

  /**
   * Get agent configuration and capabilities
   */
  public async getAgentCapabilitiesConfig(agentId: string): Promise<{
    intelligenceConfig?: any;
    securityContext?: any;
  } | null> {
    try {
      const agent = await this.repository.findOne({
        where: { id: agentId, isActive: true },
        select: ['id', 'intelligenceConfig', 'securityContext']
      });

      return agent ? {
        intelligenceConfig: agent.intelligenceConfig,
        securityContext: agent.securityContext
      } : null;
    } catch (error) {
      logger.error('Error getting agent capabilities config', { agentId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Check if any active agents are using a specific provider type
   */
  public async hasAgentsUsingProvider(apiType: string): Promise<boolean> {
    try {
      const count = await this.repository.createQueryBuilder('agent')
        .where('agent.apiType = :apiType', { apiType })
        .andWhere('agent.isActive = :isActive', { isActive: true })
        .getCount();
      
      return count > 0;
    } catch (error) {
      logger.error('Error checking agents using provider', { apiType, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get agents using a specific provider type
   */
  public async getAgentsUsingProvider(apiType: string): Promise<Agent[]> {
    try {
      return await this.repository.createQueryBuilder('agent')
        .where('agent.apiType = :apiType', { apiType })
        .andWhere('agent.isActive = :isActive', { isActive: true })
        .select(['agent.id', 'agent.name', 'agent.modelId', 'agent.apiType'])
        .getMany();
    } catch (error) {
      logger.error('Error getting agents using provider', { apiType, error: (error as Error).message });
      throw error;
    }
  }
} 