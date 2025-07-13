/**
 * AgentController - Simplified controller that delegates to middleware
 * 
 * This controller now acts as a thin layer that coordinates between
 * the middleware chain and the underlying services. Most validation
 * and context loading is handled by middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '@uaip/utils';
import {
  AgentCoreService,
  AgentContextService,
  AgentPlanningService,
  AgentLearningService,
  AgentDiscussionService,
  AgentEventOrchestrator,
  type AgentContextConfig,
  type AgentPlanningConfig,
  type AgentLearningConfig,
  type AgentDiscussionConfig
} from '../services/index.js';
import { DatabaseService, EventBusService } from '@uaip/shared-services';

export class AgentController {
  private agentCore: AgentCoreService;
  private agentContext: AgentContextService;
  private agentPlanning: AgentPlanningService;
  private agentLearning: AgentLearningService;
  private agentDiscussion: AgentDiscussionService;
  private agentOrchestrator: AgentEventOrchestrator;
  private initialized: boolean = false;

  constructor(
    private knowledgeGraphService?: any,
    private agentMemoryService?: any,
    private personaService?: any,
    private discussionService?: any,
    private databaseService?: DatabaseService,
    private eventBusService?: EventBusService
  ) {
    // Services will be initialized in the initialize method
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const baseConfig = {
      databaseService: this.databaseService || DatabaseService.getInstance(),
      eventBusService: this.eventBusService || EventBusService.getInstance(),
      knowledgeGraphService: this.knowledgeGraphService,
      llmService: null, // Will be set by service
      serviceName: 'agent-intelligence',
      securityLevel: 3
    };

    // Initialize event-driven services with proper configs
    this.agentCore = new AgentCoreService({
      databaseService: baseConfig.databaseService,
      eventBusService: baseConfig.eventBusService,
      serviceName: 'agent-intelligence',
      securityLevel: 3
    });

    this.agentContext = new AgentContextService({
      eventBusService: baseConfig.eventBusService,
      knowledgeGraphService: this.knowledgeGraphService,
      llmService: null, // Event-driven, no direct LLM
      serviceName: 'agent-intelligence',
      securityLevel: 3
    });

    this.agentPlanning = new AgentPlanningService({
      databaseService: baseConfig.databaseService,
      eventBusService: baseConfig.eventBusService,
      knowledgeGraphService: this.knowledgeGraphService,
      serviceName: 'agent-intelligence',
      securityLevel: 3
    });

    this.agentLearning = new AgentLearningService({
      databaseService: baseConfig.databaseService,
      eventBusService: baseConfig.eventBusService,
      knowledgeGraphService: this.knowledgeGraphService,
      agentMemoryService: this.agentMemoryService,
      serviceName: 'agent-intelligence',
      securityLevel: 3
    });

    this.agentDiscussion = new AgentDiscussionService({
      databaseService: baseConfig.databaseService,
      eventBusService: baseConfig.eventBusService,
      knowledgeGraphService: this.knowledgeGraphService,
      agentMemoryService: this.agentMemoryService,
      discussionService: this.discussionService,
      llmService: null, // Event-driven
      userLLMService: null, // Event-driven
      serviceName: 'agent-intelligence',
      securityLevel: 3
    });

    this.agentOrchestrator = new AgentEventOrchestrator({
      ...baseConfig,
      orchestrationPipelineUrl: process.env.ORCHESTRATION_PIPELINE_URL || 'http://localhost:3002'
    });

    // Initialize all services
    await this.agentCore.initialize();
    await this.agentContext.initialize();
    await this.agentPlanning.initialize();
    await this.agentLearning.initialize();
    await this.agentDiscussion.initialize();

    this.initialized = true;
    logger.info('AgentController initialized successfully');
  }

  // Service getters for middleware to use
  getCoreService(): AgentCoreService {
    return this.agentCore;
  }

  getContextService(): AgentContextService {
    return this.agentContext;
  }

  getPlanningService(): AgentPlanningService {
    return this.agentPlanning;
  }

  getLearningService(): AgentLearningService {
    return this.agentLearning;
  }

  getDiscussionService(): AgentDiscussionService {
    return this.agentDiscussion;
  }

  getEventOrchestrator(): AgentEventOrchestrator {
    return this.agentOrchestrator;
  }

  // Legacy method handlers for backward compatibility
  async listAgents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agents = await this.agentCore.getAgents(req.query);
      res.json(agents);
    } catch (error) {
      next(error);
    }
  }

  async getAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agent = await this.agentCore.getAgent(req.params.id);
      res.json(agent);
    } catch (error) {
      next(error);
    }
  }

  async createAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agent = await this.agentCore.createAgent(req.body, req.user?.id || 'system');
      res.status(201).json(agent);
    } catch (error) {
      next(error);
    }
  }

  async updateAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agent = await this.agentCore.updateAgent(req.params.id, req.body, req.user?.id || 'system');
      res.json(agent);
    } catch (error) {
      next(error);
    }
  }

  async deleteAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.agentCore.deleteAgent(req.params.id, req.user?.id || 'system');
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async analyzeContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.agentContext.analyzeContext(
        req.params.id,
        req.body.conversationContext || {},
        req.body.userRequest || '',
        req.user?.id
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async planExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Get agent first, then generate plan
      const agent = await this.agentCore.getAgent(req.params.id);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      
      const plan = await this.agentPlanning.generateExecutionPlan(
        agent,
        req.body.analysis || {},
        req.body.userPreferences,
        req.body.securityContext
      );
      res.json(plan);
    } catch (error) {
      next(error);
    }
  }

  async getCapabilities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Get agent and return its capabilities
      const agent = await this.agentCore.getAgent(req.params.id);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.json({ capabilities: agent.capabilities || [] });
    } catch (error) {
      next(error);
    }
  }

  async learnFromExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.agentLearning.processLearningData({
        agentId: req.params.id,
        executionData: req.body
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async participateInDiscussion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.agentDiscussion.processDiscussionMessage({
        agentId: req.params.id,
        ...req.body
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async handleAgentChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.agentDiscussion.processDiscussionMessage({
        agentId: req.params.id,
        userId: req.user?.id,
        ...req.body
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // Shutdown method
  async shutdown(): Promise<void> {
    if (this.agentOrchestrator) {
      await this.agentOrchestrator.shutdown();
    }
    logger.info('AgentController shutdown completed');
  }
}