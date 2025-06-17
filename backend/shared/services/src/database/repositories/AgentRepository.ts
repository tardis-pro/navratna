import { logger } from '@uaip/utils';
import { BaseRepository } from '../base/BaseRepository.js';
import { Agent } from '../../entities/agent.entity.js';

export class AgentRepository extends BaseRepository<Agent> {
  constructor() {
    super(Agent);
  }

  /**
   * Get all active agents with limit
   */
  public async getActiveAgents(limit?: number): Promise<Agent[]> {
    try {
      const queryBuilder = this.repository.createQueryBuilder('agent')
        .where('agent.isActive = :isActive', { isActive: true })
        .orderBy('agent.createdAt', 'DESC');

      if (limit) {
        queryBuilder.limit(limit);
      }

      const agents = await queryBuilder.getMany();
      return agents;
    } catch (error) {
      logger.error('Error getting active agents', { limit, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get agent by ID with active status check
   */
  public async getActiveAgentById(agentId: string): Promise<Agent | null> {
    try {
      const agent = await this.repository.findOne({
        where: { id: agentId, isActive: true }
      });

      return agent;
    } catch (error) {
      logger.error('Error getting active agent by ID', { agentId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Create a new agent
   */
  public async createAgent(agentData: {
    id?: string;
    name: string;
    role: string;
    persona: any;
    intelligenceConfig: any;
    securityContext: any;
    createdBy?: string;
  }): Promise<Agent> {
    try {
      const agent = this.repository.create({
        id: agentData.id,
        name: agentData.name,
        role: agentData.role as any,
        persona: agentData.persona,
        intelligenceConfig: agentData.intelligenceConfig,
        securityContext: agentData.securityContext,
        isActive: true,
        createdBy: agentData.createdBy
      });

      const savedAgent = await this.repository.save(agent);
      return savedAgent;
    } catch (error) {
      logger.error('Error creating agent', { agentData, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Update an agent
   */
  public async updateAgent(agentId: string, updateData: {
    name?: string;
    role?: string;
    persona?: any;
    intelligenceConfig?: any;
    securityContext?: any;
  }): Promise<Agent | null> {
    try {
      // Prepare the update payload with proper typing
      const updatePayload: any = {
        updatedAt: new Date()
      };

      if (updateData.name !== undefined) updatePayload.name = updateData.name;
      if (updateData.role !== undefined) updatePayload.role = updateData.role as any;
      if (updateData.persona !== undefined) updatePayload.persona = updateData.persona;
      if (updateData.intelligenceConfig !== undefined) updatePayload.intelligenceConfig = updateData.intelligenceConfig;
      if (updateData.securityContext !== undefined) updatePayload.securityContext = updateData.securityContext;

      const updateResult = await this.repository.update(
        { id: agentId, isActive: true },
        updatePayload
      );

      if (updateResult.affected === 0) {
        return null;
      }

      // Return the updated agent
      const updatedAgent = await this.repository.findOne({
        where: { id: agentId, isActive: true }
      });

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

    return (result.affected || 0) > 0;
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
        // Store in execution_plans table (for EnhancedAgentIntelligenceService)
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
        select: ['intelligenceConfig', 'securityContext']
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
} 