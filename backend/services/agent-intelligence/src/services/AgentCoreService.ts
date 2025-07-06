import { logger } from '@uaip/utils';
import { AgentService, EventBusService } from '@uaip/shared-services';
import { Agent, AgentStatus, AgentRole, SecurityLevel } from '@uaip/types';

export class AgentCoreService {
  private agentService: AgentService;
  private eventBusService: EventBusService;

  constructor() {
    this.agentService = AgentService.getInstance();
    this.eventBusService = EventBusService.getInstance();
  }

  async createAgent(agentData: {
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
  }, userId: string): Promise<Agent> {
    try {
      logger.info('Creating new agent', { agentData, userId });

      // Create agent with enhanced data
      const agent = await this.agentService.createAgent({
        ...agentData,
        role: agentData.role || AgentRole.ASSISTANT,
        status: agentData.status || AgentStatus.IDLE,
        securityLevel: agentData.securityLevel || SecurityLevel.MEDIUM
      });

      // Emit agent created event
      await this.eventBusService.publish('agent.created', {
        agentId: agent.id,
        userId,
        agentData: agent,
        timestamp: new Date()
      });

      logger.info('Agent created successfully', { agentId: agent.id, userId });
      return agent as unknown as Agent;
    } catch (error) {
      logger.error('Failed to create agent', { error, agentData, userId });
      throw error;
    }
  }

  async updateAgent(agentId: string, updates: any, userId: string): Promise<Agent | null> {
    try {
      logger.info('Updating agent', { agentId, updates, userId });

      const agent = await this.agentService.updateAgent(agentId, updates);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Emit agent updated event
      await this.eventBusService.publish('agent.updated', {
        agentId,
        userId,
        updates,
        agent,
        timestamp: new Date()
      });

      logger.info('Agent updated successfully', { agentId, userId });
      return agent as unknown as Agent;
    } catch (error) {
      logger.error('Failed to update agent', { error, agentId, updates, userId });
      throw error;
    }
  }

  async deleteAgent(agentId: string, userId: string): Promise<void> {
    try {
      logger.info('Deleting agent', { agentId, userId });

      // First get the agent for the event
      const agent = await this.agentService.findAgentById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Set status to inactive before deletion
      await this.agentService.updateAgentStatus(agentId, AgentStatus.INACTIVE);

      // Delete the agent
      const deleted = await this.agentService.deleteAgent(agentId);
      if (!deleted) {
        throw new Error('Failed to delete agent');
      }

      // Emit agent deleted event
      await this.eventBusService.publish('agent.deleted', {
        agentId,
        userId,
        agent,
        timestamp: new Date()
      });

      logger.info('Agent deleted successfully', { agentId, userId });
    } catch (error) {
      logger.error('Failed to delete agent', { error, agentId, userId });
      throw error;
    }
  }

  async listAgents(filters?: {
    status?: AgentStatus;
    role?: AgentRole;
    securityLevel?: SecurityLevel;
  }): Promise<Agent[]> {
    try {
      logger.debug('Listing agents', { filters });

      if (filters?.status) {
        // Filter by specific status
        if (filters.status === AgentStatus.ACTIVE || filters.status === AgentStatus.IDLE) {
          const agents = await this.agentService.findActiveAgents();
          return agents as unknown as Agent[];
        } else {
          // For other statuses, we'd need to implement specific methods
          return [];
        }
      }

      if (filters?.role) {
        const agents = await this.agentService.findAgentsByRole(filters.role);
        return agents as unknown as Agent[];
      }

      // Default: return active agents
      const agents = await this.agentService.findActiveAgents();
      return agents as unknown as Agent[];
    } catch (error) {
      logger.error('Failed to list agents', { error, filters });
      throw error;
    }
  }

  async getAgentCapabilities(agentId: string): Promise<string[]> {
    try {
      const agent = await this.agentService.findAgentById(agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      return agent.capabilities || [];
    } catch (error) {
      logger.error('Failed to get agent capabilities', { error, agentId });
      throw error;
    }
  }

  async assignCapability(agentId: string, capabilityId: string, userId: string): Promise<void> {
    try {
      await this.agentService.assignCapabilityToAgent(agentId, capabilityId);

      // Emit capability assigned event
      await this.eventBusService.publish('agent.capability.assigned', {
        agentId,
        capabilityId,
        userId,
        timestamp: new Date()
      });

      logger.info('Capability assigned to agent', { agentId, capabilityId, userId });
    } catch (error) {
      logger.error('Failed to assign capability', { error, agentId, capabilityId, userId });
      throw error;
    }
  }

  async removeCapability(agentId: string, capabilityId: string, userId: string): Promise<void> {
    try {
      await this.agentService.removeCapabilityFromAgent(agentId, capabilityId);

      // Emit capability removed event
      await this.eventBusService.publish('agent.capability.removed', {
        agentId,
        capabilityId,
        userId,
        timestamp: new Date()
      });

      logger.info('Capability removed from agent', { agentId, capabilityId, userId });
    } catch (error) {
      logger.error('Failed to remove capability', { error, agentId, capabilityId, userId });
      throw error;
    }
  }
}