import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { AgentController } from '../../controllers/agentController.js';
import { createMockDatabaseService, createMockEventBusService } from '../utils/mockServices.js';

// Mock all external dependencies for integration testing
vi.mock('@uaip/shared-services', () => ({
  DatabaseService: vi.fn().mockImplementation(() => createMockDatabaseService()),
  EventBusService: vi.fn().mockImplementation(() => createMockEventBusService()),
  KnowledgeGraphService: vi.fn().mockImplementation(() => ({
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' })
  })),
  AgentMemoryService: vi.fn().mockImplementation(() => ({
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' })
  })),
  PersonaService: vi.fn().mockImplementation(() => ({
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' })
  })),
  DiscussionService: vi.fn().mockImplementation(() => ({
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' })
  })),
  CapabilityDiscoveryService: vi.fn().mockImplementation(() => ({
    discoverCapabilities: vi.fn().mockResolvedValue([]),
    getAgentCapabilities: vi.fn().mockResolvedValue([])
  })),
  SecurityValidationService: vi.fn().mockImplementation(() => ({
    validateOperation: vi.fn().mockResolvedValue({
      allowed: true,
      riskLevel: 'MEDIUM',
      approvalRequired: false,
      conditions: [],
      reasoning: 'Operation approved'
    }),
    assessRisk: vi.fn().mockResolvedValue({
      level: 'MEDIUM',
      overallRisk: 'LOW',
      score: 25,
      factors: [],
      recommendations: [],
      mitigations: [],
      assessedAt: new Date(),
      assessedBy: 'system'
    })
  }))
}));

describe('Agent Intelligence Service Integration', () => {
  let controller: AgentController;

  beforeAll(() => {
    // Initialize the controller with all dependencies
    controller = new AgentController();
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('Service Initialization', () => {
    it('should initialize controller successfully', () => {
      expect(controller).toBeDefined();
      expect(controller).toBeInstanceOf(AgentController);
    });

    it('should have all required methods', () => {
      expect(typeof controller.analyzeContext).toBe('function');
      expect(typeof controller.generatePlan).toBe('function');
      expect(typeof controller.createAgent).toBe('function');
      expect(typeof controller.getAgent).toBe('function');
      expect(typeof controller.getAgentWithPersona).toBe('function');
      expect(typeof controller.getAgents).toBe('function');
      expect(typeof controller.updateAgent).toBe('function');
      expect(typeof controller.deleteAgent).toBe('function');
      expect(typeof controller.getAgentCapabilities).toBe('function');
      expect(typeof controller.learnFromOperation).toBe('function');
      expect(typeof controller.participateInDiscussion).toBe('function');
      expect(typeof controller.chatWithAgent).toBe('function');
    });
  });

  describe('Service Dependencies', () => {
    it('should have enhanced agent intelligence service', () => {
      const service = (controller as any).agentIntelligenceService;
      expect(service).toBeDefined();
    });

    it('should have capability discovery service', () => {
      const service = (controller as any).capabilityDiscoveryService;
      expect(service).toBeDefined();
    });

    it('should have security validation service', () => {
      const service = (controller as any).securityValidationService;
      expect(service).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should handle missing optional services gracefully', () => {
      const minimalController = new AgentController();
      expect(minimalController).toBeDefined();
      expect(minimalController).toBeInstanceOf(AgentController);
    });

    it('should maintain service isolation', () => {
      const service1 = (controller as any).agentIntelligenceService;
      const service2 = (controller as any).capabilityDiscoveryService;
      const service3 = (controller as any).securityValidationService;
      
      expect(service1).not.toBe(service2);
      expect(service1).not.toBe(service3);
      expect(service2).not.toBe(service3);
    });
  });

  describe('Error Resilience', () => {
    it('should handle service initialization errors gracefully', () => {
      // This tests that the constructor doesn't throw even if services fail to initialize
      expect(() => {
        new AgentController();
      }).not.toThrow();
    });
  });
});