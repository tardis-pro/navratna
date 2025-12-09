import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentController } from '../../controllers/agentController.js';
import {
  createMockDatabaseService,
  createMockEventBusService,
  createMockAgentCoreService,
  createMockAgentContextService,
  createMockAgentPlanningService,
  createMockAgentLearningService,
  createMockAgentDiscussionService,
  createMockAgentEventOrchestrator,
  createMockAgent,
} from '../utils/mockServices.js';
import { createMockRequest, createMockResponse, createMockNext } from '../setup.js';
import { SecurityLevel, RiskLevel } from '@uaip/types';

// Mock the individual services
vi.mock('../../services/AgentCoreService.js');
vi.mock('../../services/AgentContextService.js');
vi.mock('../../services/AgentPlanningService.js');
vi.mock('../../services/AgentLearningService.js');
vi.mock('../../services/AgentDiscussionService.js');
vi.mock('../../services/AgentEventOrchestrator.js');

describe('AgentController', () => {
  let controller: AgentController;
  let mockAgentCoreService: ReturnType<typeof createMockAgentCoreService>;
  let mockAgentContextService: ReturnType<typeof createMockAgentContextService>;
  let mockAgentPlanningService: ReturnType<typeof createMockAgentPlanningService>;
  let mockAgentLearningService: ReturnType<typeof createMockAgentLearningService>;
  let mockAgentDiscussionService: ReturnType<typeof createMockAgentDiscussionService>;
  let mockAgentEventOrchestrator: ReturnType<typeof createMockAgentEventOrchestrator>;
  let mockDatabaseService: ReturnType<typeof createMockDatabaseService>;
  let mockEventBusService: ReturnType<typeof createMockEventBusService>;

  beforeEach(async () => {
    // Create fresh mocks for each test
    mockAgentCoreService = createMockAgentCoreService();
    mockAgentContextService = createMockAgentContextService();
    mockAgentPlanningService = createMockAgentPlanningService();
    mockAgentLearningService = createMockAgentLearningService();
    mockAgentDiscussionService = createMockAgentDiscussionService();
    mockAgentEventOrchestrator = createMockAgentEventOrchestrator();
    mockDatabaseService = createMockDatabaseService();
    mockEventBusService = createMockEventBusService();

    // Initialize controller with mocked services
    controller = new AgentController(
      undefined, // knowledgeGraphService
      undefined, // agentMemoryService
      undefined, // personaService
      undefined, // discussionService
      mockDatabaseService,
      mockEventBusService
    );

    // Manually set the mocked services since the constructor logic has changed
    (controller as any).agentCore = mockAgentCoreService;
    (controller as any).agentContext = mockAgentContextService;
    (controller as any).agentPlanning = mockAgentPlanningService;
    (controller as any).agentLearning = mockAgentLearningService;
    (controller as any).agentDiscussion = mockAgentDiscussionService;
    (controller as any).agentOrchestrator = mockAgentEventOrchestrator;

    await controller.initialize();
  });

  describe('Agent Management', () => {
    it('should list agents', async () => {
      const req = createMockRequest({}, {}, { limit: '10' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();
      await controller.listAgents(req, res, next);
      expect(mockAgentCoreService.listAgents).toHaveBeenCalledWith({ limit: '10' });
      expect(res.json).toHaveBeenCalledWith([expect.any(Object)]);
    });

    it('should get an agent by ID', async () => {
      const req = createMockRequest({}, { id: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();
      await controller.getAgent(req, res, next);
      expect(mockAgentCoreService.getAgent).toHaveBeenCalledWith('agent-123');
      expect(res.json).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should create an agent', async () => {
      const req = createMockRequest({ name: 'New Agent' }, {}, {}, { id: 'user-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();
      await controller.createAgent(req, res, next);
      expect(mockAgentCoreService.createAgent).toHaveBeenCalledWith(
        { name: 'New Agent' },
        'user-123'
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should update an agent', async () => {
      const req = createMockRequest(
        { name: 'Updated Agent' },
        { id: 'agent-123' },
        {},
        { id: 'user-123' }
      ) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();
      await controller.updateAgent(req, res, next);
      expect(mockAgentCoreService.updateAgent).toHaveBeenCalledWith(
        'agent-123',
        { name: 'Updated Agent' },
        'user-123'
      );
      expect(res.json).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should delete an agent', async () => {
      const req = createMockRequest({}, { id: 'agent-123' }, {}, { id: 'user-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();
      await controller.deleteAgent(req, res, next);
      expect(mockAgentCoreService.deleteAgent).toHaveBeenCalledWith('agent-123', 'user-123');
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  describe('Context Analysis', () => {
    it('should analyze context', async () => {
      const req = createMockRequest({ userRequest: 'some request' }, { id: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();
      await controller.analyzeContext(req, res, next);
      expect(mockAgentContextService.analyzeContext).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('Execution Planning', () => {
    it('should generate an execution plan', async () => {
      const req = createMockRequest({ analysis: {} }, { id: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();
      await controller.planExecution(req, res, next);
      expect(mockAgentPlanningService.generateExecutionPlan).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('Learning', () => {
    it('should process learning data', async () => {
      const req = createMockRequest({ executionData: {} }, { id: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();
      await controller.learnFromExecution(req, res, next);
      expect(mockAgentLearningService.processLearningData).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('Discussion', () => {
    it('should participate in a discussion', async () => {
      const req = createMockRequest({ message: 'hello' }, { id: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();
      await controller.participateInDiscussion(req, res, next);
      expect(mockAgentDiscussionService.processDiscussionMessage).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.any(Object));
    });
  });
});
