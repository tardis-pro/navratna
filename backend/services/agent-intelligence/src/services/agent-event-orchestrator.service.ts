/**
 * Agent Intelligence Event Orchestrator
 * Coordinates events between all agent intelligence microservices
 * Integrates with the orchestration pipeline for cross-app events
 */

import { Agent, Operation, OperationStatus, ExecutionPlan } from '@uaip/types';
import { logger } from '@uaip/utils';
import { EventBusService, DatabaseService } from '@uaip/shared-services';
import {
  AgentCoreService,
  AgentContextService,
  AgentPlanningService,
  AgentLearningService,
  AgentDiscussionService,
  AgentMetricsService,
  AgentIntentService,
  AgentInitializationService,
} from './index.js';

export interface AgentEventOrchestratorConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  orchestrationPipelineUrl: string;
  serviceName: string;
  securityLevel: number;
}

export interface AgentOperationRequest {
  agentId: string;
  operationType: 'analyze' | 'plan' | 'learn' | 'discuss' | 'initialize' | 'metrics';
  payload: any;
  context?: any;
  priority?: 'low' | 'normal' | 'high';
  timeout?: number;
}

export class AgentEventOrchestrator {
  private databaseService: DatabaseService;
  public eventBusService: EventBusService; // Make public for WebSocket chat subscription
  private orchestrationPipelineUrl: string;
  private serviceName: string;
  private securityLevel: number;

  // Microservice instances
  private agentCoreService?: AgentCoreService;
  private agentContextService?: AgentContextService;
  private agentPlanningService?: AgentPlanningService;
  private agentLearningService?: AgentLearningService;
  private agentDiscussionService?: AgentDiscussionService;
  private agentMetricsService?: AgentMetricsService;
  private agentIntentService?: AgentIntentService;
  private agentInitializationService?: AgentInitializationService;

  // Event tracking
  private activeOperations = new Map<string, any>();
  private eventSubscriptions = new Map<string, Function>();

  constructor(config: AgentEventOrchestratorConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.orchestrationPipelineUrl = config.orchestrationPipelineUrl;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;
  }

  async initialize(services: {
    agentCoreService?: AgentCoreService;
    agentContextService?: AgentContextService;
    agentPlanningService?: AgentPlanningService;
    agentLearningService?: AgentLearningService;
    agentDiscussionService?: AgentDiscussionService;
    agentMetricsService?: AgentMetricsService;
    agentIntentService?: AgentIntentService;
    agentInitializationService?: AgentInitializationService;
  }): Promise<void> {
    // Store service references
    this.agentCoreService = services.agentCoreService;
    this.agentContextService = services.agentContextService;
    this.agentPlanningService = services.agentPlanningService;
    this.agentLearningService = services.agentLearningService;
    this.agentDiscussionService = services.agentDiscussionService;
    this.agentMetricsService = services.agentMetricsService;
    this.agentIntentService = services.agentIntentService;
    this.agentInitializationService = services.agentInitializationService;

    // Initialize all services
    await this.initializeServices();

    // Set up event subscriptions
    await this.setupEventSubscriptions();

    // Set up orchestration pipeline integration
    await this.setupOrchestrationIntegration();

    logger.info('Agent Event Orchestrator initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel,
      servicesCount: Object.keys(services).length,
    });
  }

  /**
   * Execute a complex agent operation that spans multiple services
   */
  async executeAgentOperation(request: AgentOperationRequest): Promise<string> {
    const operationId = `agent_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.info('Executing agent operation', {
        operationId,
        agentId: request.agentId,
        operationType: request.operationType,
      });

      // Create operation for orchestration pipeline
      const operation: Operation = {
        id: operationId,
        type: 'agent_operation' as any,
        agentId: request.agentId,
        status: OperationStatus.PENDING,
        executionPlan: await this.createExecutionPlan(request),
        context: {
          executionContext: {
            agentId: request.agentId,
            userId: request.context?.userId || '',
            environment: (process.env.NODE_ENV as any) || 'development',
            timeout: request.timeout || 300000,
            resourceLimits: {
              maxMemory: 1024 * 1024 * 1024, // 1GB
              maxCpu: 2,
              maxDuration: request.timeout || 300000,
            },
          },
        },
        metadata: {
          priority: 'medium' as any,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Store operation locally
      this.activeOperations.set(operationId, {
        operation,
        request,
        startTime: Date.now(),
        status: 'executing',
      });

      // Submit to orchestration pipeline
      const workflowInstanceId = await this.submitToOrchestrationPipeline(operation);

      // Publish operation started event
      await this.publishEvent('agent.operation.started', {
        operationId,
        workflowInstanceId,
        agentId: request.agentId,
        operationType: request.operationType,
      });

      this.auditLog('AGENT_OPERATION_STARTED', {
        operationId,
        agentId: request.agentId,
        operationType: request.operationType,
      });

      return workflowInstanceId;
    } catch (error) {
      logger.error('Failed to execute agent operation', { error, operationId, request });

      // Update operation status
      const activeOp = this.activeOperations.get(operationId);
      if (activeOp) {
        activeOp.status = 'failed';
        activeOp.error = error;
      }

      // Publish operation failed event
      await this.publishEvent('agent.operation.failed', {
        operationId,
        agentId: request.agentId,
        operationType: request.operationType,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Handle cross-service agent workflows
   */
  async executeAgentWorkflow(agentId: string, workflowType: string, parameters: any): Promise<any> {
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.info('Executing agent workflow', { workflowId, agentId, workflowType });

      switch (workflowType) {
        case 'full_analysis':
          return await this.executeFullAnalysisWorkflow(agentId, parameters, workflowId);
        case 'learning_cycle':
          return await this.executeLearningCycleWorkflow(agentId, parameters, workflowId);
        case 'discussion_participation':
          return await this.executeDiscussionWorkflow(agentId, parameters, workflowId);
        case 'performance_optimization':
          return await this.executePerformanceOptimizationWorkflow(agentId, parameters, workflowId);
        default:
          throw new Error(`Unknown workflow type: ${workflowType}`);
      }
    } catch (error) {
      logger.error('Failed to execute agent workflow', {
        error,
        workflowId,
        agentId,
        workflowType,
      });
      throw error;
    }
  }

  /**
   * Private Methods
   */

  private async initializeServices(): Promise<void> {
    const services = [
      this.agentCoreService,
      this.agentContextService,
      this.agentPlanningService,
      this.agentLearningService,
      this.agentDiscussionService,
      this.agentMetricsService,
      this.agentIntentService,
      this.agentInitializationService,
    ];

    // Services are ready to use (no initialize method needed)
    logger.info('All agent services are ready');
  }

  private async setupEventSubscriptions(): Promise<void> {
    // Subscribe to orchestration pipeline events
    await this.subscribeToEvent('operation.event', this.handleOrchestrationEvent.bind(this));

    // Subscribe to agent service events
    await this.subscribeToEvent('agent.*.response', this.handleServiceResponse.bind(this));
    await this.subscribeToEvent('agent.operation.*', this.handleOperationEvent.bind(this));

    // Subscribe to cross-service coordination events
    await this.subscribeToEvent('agent.workflow.*', this.handleWorkflowEvent.bind(this));

    logger.info('Event subscriptions configured', {
      subscriptionsCount: this.eventSubscriptions.size,
    });
  }

  private async setupOrchestrationIntegration(): Promise<void> {
    // Set up integration with orchestration pipeline
    // This could include health checks, capability registration, etc.

    try {
      // Register agent intelligence capabilities with orchestration pipeline
      await this.registerCapabilities();
      logger.info('Orchestration pipeline integration configured');
    } catch (error) {
      logger.warn('Failed to setup orchestration integration', { error });
    }
  }

  private async createExecutionPlan(request: AgentOperationRequest): Promise<ExecutionPlan> {
    const steps = [];
    const dependencies = [];

    switch (request.operationType) {
      case 'analyze':
        steps.push(
          { id: 'get_agent', type: 'agent_query', name: 'Get Agent Data' },
          { id: 'analyze_context', type: 'context_analysis', name: 'Analyze Context' },
          { id: 'analyze_intent', type: 'intent_analysis', name: 'Analyze Intent' },
          {
            id: 'generate_recommendations',
            type: 'recommendation_generation',
            name: 'Generate Recommendations',
          }
        );
        dependencies.push(
          { stepId: 'analyze_context', dependsOn: ['get_agent'], type: 'sequential' },
          { stepId: 'analyze_intent', dependsOn: ['get_agent'], type: 'sequential' },
          {
            stepId: 'generate_recommendations',
            dependsOn: ['analyze_context', 'analyze_intent'],
            type: 'sequential',
          }
        );
        break;

      case 'plan':
        steps.push(
          { id: 'get_agent', type: 'agent_query', name: 'Get Agent Data' },
          { id: 'analyze_context', type: 'context_analysis', name: 'Analyze Context' },
          { id: 'generate_plan', type: 'plan_generation', name: 'Generate Execution Plan' },
          { id: 'validate_plan', type: 'plan_validation', name: 'Validate Plan' }
        );
        dependencies.push(
          { stepId: 'analyze_context', dependsOn: ['get_agent'], type: 'sequential' },
          { stepId: 'generate_plan', dependsOn: ['analyze_context'], type: 'sequential' },
          { stepId: 'validate_plan', dependsOn: ['generate_plan'], type: 'sequential' }
        );
        break;

      case 'learn':
        steps.push(
          { id: 'get_agent', type: 'agent_query', name: 'Get Agent Data' },
          { id: 'process_learning', type: 'learning_processing', name: 'Process Learning Data' },
          { id: 'update_knowledge', type: 'knowledge_update', name: 'Update Knowledge' },
          { id: 'consolidate_memory', type: 'memory_consolidation', name: 'Consolidate Memory' }
        );
        dependencies.push(
          { stepId: 'process_learning', dependsOn: ['get_agent'], type: 'sequential' },
          { stepId: 'update_knowledge', dependsOn: ['process_learning'], type: 'sequential' },
          { stepId: 'consolidate_memory', dependsOn: ['update_knowledge'], type: 'sequential' }
        );
        break;

      default:
        steps.push(
          { id: 'get_agent', type: 'agent_query', name: 'Get Agent Data' },
          { id: 'execute_operation', type: 'operation_execution', name: 'Execute Operation' }
        );
        dependencies.push({
          stepId: 'execute_operation',
          dependsOn: ['get_agent'],
          type: 'sequential',
        });
    }

    return {
      steps,
      dependencies,
      estimatedDuration: this.estimateOperationDuration(request.operationType),
    };
  }

  private async submitToOrchestrationPipeline(operation: Operation): Promise<string> {
    try {
      // Submit operation to orchestration pipeline via HTTP API
      const response = await fetch(`${this.orchestrationPipelineUrl}/api/v1/operations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || 'internal-service'}`,
        },
        body: JSON.stringify(operation),
      });

      if (!response.ok) {
        throw new Error(
          `Orchestration pipeline request failed: ${response.status} ${response.statusText}`
        );
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(
          `Orchestration pipeline error: ${result.error?.message || 'Unknown error'}`
        );
      }

      return result.data.workflowInstanceId;
    } catch (error) {
      logger.error('Failed to submit to orchestration pipeline', {
        error,
        operationId: operation.id,
      });
      throw error;
    }
  }

  private estimateOperationDuration(operationType: string): number {
    const baseDurations = {
      analyze: 30000, // 30 seconds
      plan: 60000, // 1 minute
      learn: 45000, // 45 seconds
      discuss: 20000, // 20 seconds
      initialize: 15000, // 15 seconds
      metrics: 10000, // 10 seconds
    };

    return baseDurations[operationType] || 30000;
  }

  private async registerCapabilities(): Promise<void> {
    // Register agent intelligence capabilities with orchestration pipeline
    const capabilities = {
      service: this.serviceName,
      capabilities: [
        'agent.analyze',
        'agent.plan',
        'agent.learn',
        'agent.discuss',
        'agent.initialize',
        'agent.metrics',
      ],
      endpoints: {
        health: '/health',
        metrics: '/metrics',
      },
      securityLevel: this.securityLevel,
    };

    // This would typically be sent to a capability registry
    logger.info('Agent intelligence capabilities registered', { capabilities });
  }

  /**
   * Workflow implementations
   */
  private async executeFullAnalysisWorkflow(
    agentId: string,
    parameters: any,
    workflowId: string
  ): Promise<any> {
    logger.info('Executing full analysis workflow', { workflowId, agentId });

    try {
      // Step 1: Get agent data
      const agent = await this.requestFromService('agent.query.get', { agentId });
      if (!agent.success) {
        throw new Error(`Failed to get agent: ${agent.error}`);
      }

      // Step 2: Analyze context
      const contextAnalysis = await this.requestFromService('agent.context.analyze', {
        agentId,
        userRequest: parameters.userRequest,
        conversationContext: parameters.conversationContext,
        constraints: parameters.constraints,
      });

      // Step 3: Analyze intent
      const intentAnalysis = await this.requestFromService('agent.intent.analyze', {
        userRequest: parameters.userRequest,
        conversationContext: parameters.conversationContext,
        agent: agent.data,
        userId: parameters.userId,
      });

      // Step 4: Generate recommendations
      const recommendations = await this.requestFromService('agent.intent.recommend', {
        agent: agent.data,
        contextAnalysis: contextAnalysis.data,
        intentAnalysis: intentAnalysis.data,
        constraints: parameters.constraints,
        relevantKnowledge: [],
        similarEpisodes: [],
        userId: parameters.userId,
      });

      // Step 5: Calculate confidence
      const confidence = await this.requestFromService('agent.intent.confidence', {
        contextAnalysis: contextAnalysis.data,
        intentAnalysis: intentAnalysis.data,
        actionRecommendations: recommendations.data,
        intelligenceConfig: agent.data.intelligenceConfig,
        relevantKnowledge: [],
        workingMemory: null,
      });

      // Step 6: Generate explanation
      const explanation = await this.requestFromService('agent.intent.explain', {
        contextAnalysis: contextAnalysis.data,
        intentAnalysis: intentAnalysis.data,
        actionRecommendations: recommendations.data,
        confidence: confidence.data,
        relevantKnowledge: [],
        similarEpisodes: [],
        agent: agent.data,
        userId: parameters.userId,
      });

      const result = {
        workflowId,
        agentId,
        contextAnalysis: contextAnalysis.data,
        intentAnalysis: intentAnalysis.data,
        recommendations: recommendations.data,
        confidence: confidence.data,
        explanation: explanation.data,
        timestamp: new Date(),
      };

      await this.publishEvent('agent.workflow.completed', {
        workflowId,
        workflowType: 'full_analysis',
        agentId,
        result,
      });

      return result;
    } catch (error) {
      await this.publishEvent('agent.workflow.failed', {
        workflowId,
        workflowType: 'full_analysis',
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async executeLearningCycleWorkflow(
    agentId: string,
    parameters: any,
    workflowId: string
  ): Promise<any> {
    logger.info('Executing learning cycle workflow', { workflowId, agentId });

    try {
      // Step 1: Process learning from operation
      if (parameters.operationId) {
        await this.requestFromService('agent.learning.operation', {
          agentId,
          operationId: parameters.operationId,
          outcomes: parameters.outcomes,
          feedback: parameters.feedback,
        });
      }

      // Step 2: Process learning from interaction
      if (parameters.interaction) {
        await this.requestFromService('agent.learning.interaction', {
          agentId,
          interaction: parameters.interaction,
        });
      }

      // Step 3: Update knowledge
      if (parameters.knowledgeItems) {
        await this.requestFromService('agent.learning.update', {
          agentId,
          knowledgeItems: parameters.knowledgeItems,
        });
      }

      // Step 4: Consolidate memory
      await this.requestFromService('agent.learning.consolidate', { agentId });

      // Step 5: Update metrics
      await this.requestFromService('agent.metrics.track', {
        agentId,
        activity: {
          type: 'learning_cycle',
          duration: Date.now() - parseInt(workflowId.split('_')[1]),
          success: true,
          context: parameters,
          metadata: { workflowId },
        },
      });

      const result = {
        workflowId,
        agentId,
        learningCompleted: true,
        timestamp: new Date(),
      };

      await this.publishEvent('agent.workflow.completed', {
        workflowId,
        workflowType: 'learning_cycle',
        agentId,
        result,
      });

      return result;
    } catch (error) {
      await this.publishEvent('agent.workflow.failed', {
        workflowId,
        workflowType: 'learning_cycle',
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async executeDiscussionWorkflow(
    agentId: string,
    parameters: any,
    workflowId: string
  ): Promise<any> {
    logger.info('Executing discussion workflow', { workflowId, agentId });

    try {
      // Step 1: Participate in discussion
      const participation = await this.requestFromService('agent.discussion.participate', {
        agentId,
        discussionId: parameters.discussionId,
        message: parameters.message,
      });

      // Step 2: Track activity
      await this.requestFromService('agent.metrics.track', {
        agentId,
        activity: {
          type: 'discussion_participation',
          duration: Date.now() - parseInt(workflowId.split('_')[1]),
          success: participation.success,
          context: parameters,
          metadata: { workflowId, discussionId: parameters.discussionId },
        },
      });

      const result = {
        workflowId,
        agentId,
        participation: participation.data,
        timestamp: new Date(),
      };

      await this.publishEvent('agent.workflow.completed', {
        workflowId,
        workflowType: 'discussion_participation',
        agentId,
        result,
      });

      return result;
    } catch (error) {
      await this.publishEvent('agent.workflow.failed', {
        workflowId,
        workflowType: 'discussion_participation',
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async executePerformanceOptimizationWorkflow(
    agentId: string,
    parameters: any,
    workflowId: string
  ): Promise<any> {
    logger.info('Executing performance optimization workflow', { workflowId, agentId });

    try {
      // Step 1: Get current metrics
      const currentMetrics = await this.requestFromService('agent.metrics.get', {
        agentId,
        timeRange: parameters.timeRange || {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          end: new Date(),
        },
      });

      // Step 2: Generate metrics summary
      const metricsSummary = await this.requestFromService('agent.metrics.summary', {
        agentId,
        timeRange: parameters.timeRange || {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          end: new Date(),
        },
      });

      // Step 3: Consolidate memory if needed
      if (metricsSummary.data?.recommendations?.includes('memory consolidation')) {
        await this.requestFromService('agent.learning.consolidate', { agentId });
      }

      const result = {
        workflowId,
        agentId,
        currentMetrics: currentMetrics.data,
        summary: metricsSummary.data,
        optimizationsApplied: ['memory_consolidation'],
        timestamp: new Date(),
      };

      await this.publishEvent('agent.workflow.completed', {
        workflowId,
        workflowType: 'performance_optimization',
        agentId,
        result,
      });

      return result;
    } catch (error) {
      await this.publishEvent('agent.workflow.failed', {
        workflowId,
        workflowType: 'performance_optimization',
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Event handlers
   */
  private async handleOrchestrationEvent(event: any): Promise<void> {
    try {
      const { operationId, eventType, data } = event;

      // Find the corresponding agent operation
      const activeOp = this.activeOperations.get(operationId);
      if (!activeOp) {
        return; // Not our operation
      }

      logger.info('Handling orchestration event', { operationId, eventType });

      switch (eventType) {
        case 'OPERATION_COMPLETED':
          activeOp.status = 'completed';
          activeOp.result = data.result;
          await this.publishEvent('agent.operation.completed', {
            operationId,
            agentId: activeOp.request.agentId,
            result: data.result,
          });
          break;

        case 'OPERATION_FAILED':
          activeOp.status = 'failed';
          activeOp.error = data.error;
          await this.publishEvent('agent.operation.failed', {
            operationId,
            agentId: activeOp.request.agentId,
            error: data.error,
          });
          break;

        case 'STEP_COMPLETED':
          await this.publishEvent('agent.operation.step_completed', {
            operationId,
            agentId: activeOp.request.agentId,
            stepId: data.stepId,
            result: data.result,
          });
          break;

        case 'STEP_FAILED':
          await this.publishEvent('agent.operation.step_failed', {
            operationId,
            agentId: activeOp.request.agentId,
            stepId: data.stepId,
            error: data.error,
          });
          break;
      }

      // Clean up completed or failed operations
      if (['completed', 'failed'].includes(activeOp.status)) {
        setTimeout(() => {
          this.activeOperations.delete(operationId);
        }, 60000); // Keep for 1 minute for potential queries
      }
    } catch (error) {
      logger.error('Failed to handle orchestration event', { error, event });
    }
  }

  private async handleServiceResponse(event: any): Promise<void> {
    try {
      logger.debug('Handling service response', { event });
      // Handle responses from individual agent services
      // This could be used for monitoring, logging, or triggering follow-up actions
    } catch (error) {
      logger.error('Failed to handle service response', { error, event });
    }
  }

  private async handleOperationEvent(event: any): Promise<void> {
    try {
      logger.debug('Handling operation event', { event });
      // Handle operation-level events
      // This could be used for cross-operation coordination
    } catch (error) {
      logger.error('Failed to handle operation event', { error, event });
    }
  }

  private async handleWorkflowEvent(event: any): Promise<void> {
    try {
      logger.debug('Handling workflow event', { event });
      // Handle workflow-level events
      // This could be used for workflow monitoring and coordination
    } catch (error) {
      logger.error('Failed to handle workflow event', { error, event });
    }
  }

  /**
   * Utility methods
   */
  private async subscribeToEvent(channel: string, handler: Function): Promise<void> {
    try {
      // Convert function to async EventHandler
      const asyncHandler = async (message: any) => {
        return Promise.resolve(handler(message));
      };
      await this.eventBusService.subscribe(channel, asyncHandler);
      this.eventSubscriptions.set(channel, handler);
    } catch (error) {
      logger.error('Failed to subscribe to event', { channel, error });
    }
  }

  public async publishEvent(channel: string, data: any): Promise<void> {
    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: this.serviceName,
        securityLevel: this.securityLevel,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to publish event', { channel, error });
    }
  }

  private async requestFromService(channel: string, data: any): Promise<any> {
    try {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Publish request
      await this.eventBusService.publish(channel, {
        requestId,
        ...data,
        source: this.serviceName,
        timestamp: new Date().toISOString(),
      });

      // Wait for response (simplified - in production, use proper request/response pattern)
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Request timeout: ${channel}`));
        }, 30000); // 30 second timeout

        const responseHandler = (response: any) => {
          if (response.requestId === requestId) {
            clearTimeout(timeout);
            resolve(response);
          }
        };

        // Subscribe to response channel
        const responseChannel = channel.replace(/\.[^.]+$/, '.response');
        const asyncResponseHandler = async (message: any) => {
          return Promise.resolve(responseHandler(message));
        };
        this.eventBusService.subscribe(responseChannel, asyncResponseHandler);
      });
    } catch (error) {
      logger.error('Failed to request from service', { channel, error });
      throw error;
    }
  }

  private auditLog(event: string, data: any): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true,
    });
  }

  /**
   * Public utility methods
   */
  public async getOperationStatus(operationId: string): Promise<any> {
    const activeOp = this.activeOperations.get(operationId);
    if (!activeOp) {
      throw new Error(`Operation not found: ${operationId}`);
    }

    return {
      operationId,
      status: activeOp.status,
      request: activeOp.request,
      startTime: activeOp.startTime,
      duration: Date.now() - activeOp.startTime,
      result: activeOp.result,
      error: activeOp.error,
    };
  }

  public async getActiveOperations(): Promise<any[]> {
    return Array.from(this.activeOperations.entries()).map(([operationId, operation]) => ({
      operationId,
      status: operation.status,
      agentId: operation.request.agentId,
      operationType: operation.request.operationType,
      startTime: operation.startTime,
      duration: Date.now() - operation.startTime,
    }));
  }

  public async cancelOperation(operationId: string, reason: string): Promise<void> {
    const activeOp = this.activeOperations.get(operationId);
    if (!activeOp) {
      throw new Error(`Operation not found: ${operationId}`);
    }

    try {
      // Cancel in orchestration pipeline
      const response = await fetch(
        `${this.orchestrationPipelineUrl}/api/v1/operations/${operationId}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || 'internal-service'}`,
          },
          body: JSON.stringify({ reason, compensate: true, force: false }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to cancel operation: ${response.status} ${response.statusText}`);
      }

      // Update local status
      activeOp.status = 'cancelled';
      activeOp.error = reason;

      await this.publishEvent('agent.operation.cancelled', {
        operationId,
        agentId: activeOp.request.agentId,
        reason,
      });

      this.auditLog('OPERATION_CANCELLED', {
        operationId,
        agentId: activeOp.request.agentId,
        reason,
      });
    } catch (error) {
      logger.error('Failed to cancel operation', { error, operationId });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down Agent Event Orchestrator');

    try {
      // Cancel all active operations
      for (const [operationId, operation] of this.activeOperations) {
        try {
          await this.cancelOperation(operationId, 'Service shutdown');
        } catch (error) {
          logger.warn('Failed to cancel operation during shutdown', { operationId, error });
        }
      }

      // Unsubscribe from all events
      for (const [channel, handler] of this.eventSubscriptions) {
        try {
          // Convert handler for unsubscribe
          const asyncHandler = async (message: any) => Promise.resolve(handler(message));
          await this.eventBusService.unsubscribe(channel, asyncHandler);
        } catch (error) {
          logger.warn('Failed to unsubscribe from event during shutdown', { channel, error });
        }
      }

      logger.info('Agent Event Orchestrator shutdown completed');
    } catch (error) {
      logger.error('Error during Agent Event Orchestrator shutdown', { error });
    }
  }
}
