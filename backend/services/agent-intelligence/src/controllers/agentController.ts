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
  AgentEventOrchestrator
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

    // Initialize services
    this.agentCore = new AgentCoreService(baseConfig);
    this.agentContext = new AgentContextService(baseConfig);
    this.agentPlanning = new AgentPlanningService(baseConfig);
    this.agentLearning = new AgentLearningService(baseConfig);
    this.agentDiscussion = new AgentDiscussionService({
      ...baseConfig,
      discussionService: this.discussionService
    });
    this.agentOrchestrator = new AgentEventOrchestrator({
      ...baseConfig,
      orchestrationPipelineUrl: process.env.ORCHESTRATION_PIPELINE_URL || 'http://localhost:3002'
    });

    // Initialize all services
    await Promise.all([
      this.agentCore.initialize(),
      this.agentContext.initialize(),
      this.agentPlanning.initialize(),
      this.agentLearning.initialize(),
      this.agentDiscussion.initialize()
    ]);

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
      const agents = await this.agentCore.listAgents(req.query);
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
      const agent = await this.agentCore.createAgent(req.body);
      res.status(201).json(agent);
    } catch (error) {
      next(error);
    }
  }

  async updateAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agent = await this.agentCore.updateAgent(req.params.id, req.body);
      res.json(agent);
    } catch (error) {
      next(error);
    }
  }

  async deleteAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.agentCore.deleteAgent(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async analyzeContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.agentContext.analyzeContext({
        agentId: req.params.id,
        ...req.body
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async planExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plan = await this.agentPlanning.createExecutionPlan({
        agentId: req.params.id,
        ...req.body
      });
      res.json(plan);
    } catch (error) {
      next(error);
    }
  }

  async getCapabilities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const capabilities = await this.agentCore.getAgentCapabilities(req.params.id);
      res.json(capabilities);
    } catch (error) {
      next(error);
    }
  }

  async learnFromExecution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.agentLearning.learnFromExecution({
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
      const result = await this.agentDiscussion.participateInDiscussion({
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
      const result = await this.agentDiscussion.handleChatRequest({
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