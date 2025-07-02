/**
 * Base Agent Class
 * Foundation for all specialized agent implementations
 * Provides common functionality and enterprise integration
 */

import { Agent, AgentRole, AgentCapability, AgentStatus } from '@uaip/types';
import { logger } from '@uaip/utils';
import { EventBusService } from '@uaip/shared-services';
import { v4 as uuidv4 } from 'uuid';

export interface BaseAgentConfig {
  id?: string;
  name: string;
  description: string;
  role: AgentRole;
  capabilities: AgentCapability[];
  eventBusService: EventBusService;
  serviceName: string;
  metadata?: Record<string, any>;
}

export abstract class BaseAgent {
  protected agent: Agent;
  protected eventBusService: EventBusService;
  protected serviceName: string;
  protected isInitialized: boolean = false;

  constructor(config: BaseAgentConfig) {
    this.agent = {
      id: config.id || uuidv4(),
      name: config.name,
      description: config.description,
      role: config.role,
      capabilities: config.capabilities,
      status: AgentStatus.INITIALIZING,
      configuration: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
      version: 1,
      metadata: {
        ...config.metadata,
        baseAgentVersion: '1.0.0',
        serviceName: config.serviceName
      }
    };

    this.eventBusService = config.eventBusService;
    this.serviceName = config.serviceName;
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Agent already initialized', { agentId: this.agent.id });
      return;
    }

    try {
      // Register agent with the system
      await this.registerAgent();

      // Set up base event subscriptions
      await this.setupBaseSubscriptions();

      // Mark as active
      this.agent.status = AgentStatus.ACTIVE;
      this.isInitialized = true;

      logger.info('Base agent initialized', {
        agentId: this.agent.id,
        name: this.agent.name,
        role: this.agent.role
      });

    } catch (error) {
      logger.error('Failed to initialize agent', { error, agentId: this.agent.id });
      this.agent.status = AgentStatus.ERROR;
      throw error;
    }
  }

  /**
   * Register agent with the system
   */
  protected async registerAgent(): Promise<void> {
    await this.eventBusService.publish('agent.registry.register', {
      agent: this.agent,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Set up base event subscriptions
   */
  protected async setupBaseSubscriptions(): Promise<void> {
    // Subscribe to agent lifecycle events
    await this.eventBusService.subscribe(
      `agent.${this.agent.id}.shutdown`,
      this.handleShutdown.bind(this)
    );

    await this.eventBusService.subscribe(
      `agent.${this.agent.id}.health_check`,
      this.handleHealthCheck.bind(this)
    );

    await this.eventBusService.subscribe(
      `agent.${this.agent.id}.update_config`,
      this.handleConfigUpdate.bind(this)
    );
  }

  /**
   * Execute a tool through the capability registry
   */
  protected async executeTool(
    toolId: string,
    parameters: any,
    securityContext?: any
  ): Promise<any> {
    const toolRequest = {
      agentId: this.agent.id,
      toolId,
      parameters,
      securityContext: securityContext || { level: 3 },
      timestamp: new Date().toISOString()
    };

    // Request tool execution through event bus
    const requestId = uuidv4();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Tool execution timeout: ${toolId}`));
      }, 30000); // 30 second timeout

      // Subscribe to response
      this.eventBusService.subscribe(
        `tool.response.${requestId}`,
        async (response) => {
          clearTimeout(timeout);
          if (response.data?.success) {
            resolve(response.data.data);
          } else {
            reject(new Error(response.data?.error || 'Tool execution failed'));
          }
        }
      );

      // Publish tool execution request
      this.eventBusService.publish('tool.execute.request', {
        ...toolRequest,
        requestId
      });
    });
  }

  /**
   * Call LLM service
   */
  protected async callLLM(
    prompt: string,
    options?: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      responseFormat?: any;
    }
  ): Promise<{ text: string; usage?: any }> {
    const llmRequest = {
      agentId: this.agent.id,
      prompt,
      options: {
        model: 'gpt-4',
        temperature: options?.temperature || 0.7,
        maxTokens: options?.maxTokens || 1000,
        systemPrompt: options?.systemPrompt,
        responseFormat: options?.responseFormat
      },
      timestamp: new Date().toISOString()
    };

    const requestId = uuidv4();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('LLM request timeout'));
      }, 60000); // 60 second timeout

      // Subscribe to response
      this.eventBusService.subscribe(
        `llm.response.${requestId}`,
        async (response) => {
          clearTimeout(timeout);
          if (response.data?.success) {
            resolve(response.data.data);
          } else {
            reject(new Error(response.data?.error || 'LLM request failed'));
          }
        }
      );

      // Publish LLM request
      this.eventBusService.publish('llm.request', {
        ...llmRequest,
        requestId
      });
    });
  }

  /**
   * Emit analytics event
   */
  protected async emitAnalytics(
    eventType: string,
    data: any
  ): Promise<void> {
    await this.eventBusService.publish('analytics.event', {
      agentId: this.agent.id,
      agentName: this.agent.name,
      eventType,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Audit log for compliance
   */
  protected auditLog(event: string, data: any): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      agentId: this.agent.id,
      agentName: this.agent.name,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true
    });
  }

  /**
   * Handle shutdown request
   */
  protected async handleShutdown(event: any): Promise<void> {
    logger.info('Agent shutdown requested', {
      agentId: this.agent.id,
      reason: event.reason
    });

    try {
      // Update status
      this.agent.status = AgentStatus.SHUTTING_DOWN;

      // Deregister from system
      await this.eventBusService.publish('agent.registry.deregister', {
        agentId: this.agent.id,
        timestamp: new Date().toISOString()
      });

      // Clean up resources
      await this.cleanup();

      // Mark as inactive
      this.agent.status = AgentStatus.INACTIVE;
      this.isInitialized = false;

      logger.info('Agent shutdown complete', { agentId: this.agent.id });

    } catch (error) {
      logger.error('Error during agent shutdown', { error, agentId: this.agent.id });
      this.agent.status = AgentStatus.ERROR;
    }
  }

  /**
   * Handle health check
   */
  protected async handleHealthCheck(event: any): Promise<void> {
    const health = {
      agentId: this.agent.id,
      name: this.agent.name,
      status: this.agent.status,
      isInitialized: this.isInitialized,
      uptime: Date.now() - this.agent.createdAt.getTime(),
      capabilities: this.agent.capabilities,
      metadata: await this.getHealthMetadata()
    };

    await this.eventBusService.publish(`agent.health.response.${event.requestId}`, {
      ...health,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle configuration update
   */
  protected async handleConfigUpdate(event: any): Promise<void> {
    const { configuration } = event;

    try {
      // Validate configuration
      this.validateConfiguration(configuration);

      // Update agent configuration
      this.agent.configuration = {
        ...this.agent.configuration,
        ...configuration
      };

      this.agent.updatedAt = new Date();
      this.agent.version += 1;

      // Apply configuration changes
      await this.applyConfiguration(configuration);

      await this.eventBusService.publish(`agent.config.updated.${this.agent.id}`, {
        agentId: this.agent.id,
        version: this.agent.version,
        timestamp: new Date().toISOString()
      });

      this.auditLog('AGENT_CONFIG_UPDATED', {
        changes: Object.keys(configuration)
      });

    } catch (error) {
      logger.error('Failed to update agent configuration', {
        error,
        agentId: this.agent.id
      });
      throw error;
    }
  }

  /**
   * Respond to a request
   */
  protected async respondToRequest(requestId: string, response: any): Promise<void> {
    await this.eventBusService.publish(`agent.response.${requestId}`, {
      ...response,
      agentId: this.agent.id,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get agent information
   */
  public getAgentInfo(): Agent {
    return { ...this.agent };
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract cleanup(): Promise<void>;
  protected abstract getHealthMetadata(): Promise<any>;
  protected abstract validateConfiguration(config: any): void;
  protected abstract applyConfiguration(config: any): Promise<void>;
}