import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentController } from '../../controllers/agentController.js';
import {
  createMockDatabaseService,
  createMockEventBusService,
  createMockPersonaService,
  createMockDiscussionService,
  createMockKnowledgeGraphService,
  createMockAgentMemoryService,
  createMockAgent
} from '../utils/mockServices.js';
import { createMockRequest, createMockResponse, createMockNext } from '../setup.js';
import { SecurityLevel, RiskLevel } from '@uaip/types';

// Mock the shared services
vi.mock('@uaip/shared-services', () => ({
  CapabilityDiscoveryService: vi.fn().mockImplementation(() => ({
    discoverCapabilities: vi.fn().mockResolvedValue([]),
    analyzeAgentCapabilities: vi.fn().mockResolvedValue({
      agentId: 'agent-123',
      capabilities: ['analysis'],
      strengths: ['logical thinking'],
      limitations: []
    })
  })),
  SecurityValidationService: vi.fn().mockImplementation(() => ({
    validateOperation: vi.fn().mockResolvedValue({
      allowed: true,
      riskLevel: SecurityLevel.MEDIUM,
      approvalRequired: false,
      conditions: [],
      reasoning: 'Operation approved'
    }),
    assessRisk: vi.fn().mockResolvedValue({
      level: SecurityLevel.MEDIUM,
      overallRisk: RiskLevel.LOW,
      score: 25,
      factors: [],
      recommendations: [],
      mitigations: [],
      assessedAt: new Date(),
      assessedBy: 'system'
    })
  }))
}));

// Mock the EnhancedAgentIntelligenceService
vi.mock('../../services/enhanced-agent-intelligence.service.js', () => ({
  EnhancedAgentIntelligenceService: vi.fn().mockImplementation(() => ({
    analyzeContext: vi.fn().mockResolvedValue({
      analysisId: 'analysis-123',
      agentId: 'agent-123',
      contextSummary: 'Test context analysis',
      insights: ['Insight 1', 'Insight 2'],
      recommendations: ['Recommendation 1'],
      confidence: 0.85,
      processingTime: 150,
      timestamp: new Date()
    }),
    planExecution: vi.fn().mockResolvedValue({
      planId: 'plan-123',
      agentId: 'agent-123',
      steps: [
        {
          id: 'step-1',
          name: 'Analysis',
          type: 'cognitive',
          estimatedDuration: 30,
          dependencies: []
        }
      ],
      estimatedDuration: 30,
      resourceRequirements: {
        cpu: 1,
        memory: 512
      },
      riskAssessment: {
        level: SecurityLevel.LOW,
        score: 10
      },
      timestamp: new Date()
    }),
    executeAction: vi.fn().mockResolvedValue({
      actionId: 'action-123',
      result: 'success',
      output: 'Action completed successfully',
      duration: 100,
      timestamp: new Date()
    }),
    healthCheck: vi.fn().mockResolvedValue({
      status: 'healthy',
      services: {
        knowledgeGraph: 'healthy',
        memory: 'healthy',
        persona: 'healthy',
        discussion: 'healthy'
      }
    })
  }))
}));

describe('AgentController', () => {
  let controller: AgentController;
  let mockKnowledgeGraphService: ReturnType<typeof createMockKnowledgeGraphService>;
  let mockAgentMemoryService: ReturnType<typeof createMockAgentMemoryService>;
  let mockPersonaService: ReturnType<typeof createMockPersonaService>;
  let mockDiscussionService: ReturnType<typeof createMockDiscussionService>;
  let mockDatabaseService: ReturnType<typeof createMockDatabaseService>;
  let mockEventBusService: ReturnType<typeof createMockEventBusService>;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockKnowledgeGraphService = createMockKnowledgeGraphService();
    mockAgentMemoryService = createMockAgentMemoryService();
    mockPersonaService = createMockPersonaService();
    mockDiscussionService = createMockDiscussionService();
    mockDatabaseService = createMockDatabaseService();
    mockEventBusService = createMockEventBusService();

    // Initialize controller with all dependencies
    controller = new AgentController(
      mockKnowledgeGraphService as any,
      mockAgentMemoryService,
      mockPersonaService,
      mockDiscussionService,
      mockDatabaseService,
      mockEventBusService
    );
  });

  describe('Initialization', () => {
    it('should initialize successfully with all services', () => {
      expect(controller).toBeDefined();
      expect(controller).toBeInstanceOf(AgentController);
    });

    it('should initialize successfully with minimal services', () => {
      const minimalController = new AgentController(
        undefined,
        undefined,
        mockPersonaService as any,
        mockDiscussionService,
        mockDatabaseService,
        mockEventBusService
      );

      expect(minimalController).toBeDefined();
      expect(minimalController).toBeInstanceOf(AgentController);
    });
  });

  describe('Context Analysis', () => {
    it('should analyze context successfully', async () => {
      // Mock the agent intelligence service to have the getAgent method
      const mockAgentIntelligenceService = {
        getAgent: vi.fn().mockResolvedValue({
          id: 'agent-123',
          name: 'Test Agent',
          type: 'analytical',
          status: 'active'
        }),
        analyzeContext: vi.fn().mockResolvedValue({
          analysis: 'Context analysis result',
          recommendedActions: ['action1', 'action2'],
          confidence: 0.85,
          explanation: 'Test explanation'
        })
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;
      (controller as any).capabilityDiscoveryService = {
        getAgentCapabilities: vi.fn().mockResolvedValue([])
      };
      (controller as any).securityValidationService = {
        validateOperation: vi.fn().mockResolvedValue({
          allowed: true,
          riskLevel: 'MEDIUM',
          approvalRequired: false,
          conditions: [],
          reasoning: 'Operation approved'
        })
      };

      const req = createMockRequest({
        conversationContext: {
          type: 'conversation',
          data: 'User is asking about weather in New York'
        },
        userRequest: 'What is the weather in New York?',
        constraints: {}
      }, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.analyzeContext(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          analysis: expect.any(String),
          recommendedActions: expect.arrayContaining([expect.any(String)]),
          confidence: expect.any(Number),
          explanation: expect.any(String),
          availableCapabilities: expect.any(Array),
          securityAssessment: expect.objectContaining({
            allowed: true,
            riskLevel: expect.any(String),
            reasoning: expect.any(String)
          }),
          meta: expect.objectContaining({
            timestamp: expect.any(Date),
            agentId: 'agent-123',
            version: expect.any(String)
          })
        })
      });
    });

    it('should handle missing agent ID in context analysis', async () => {
      const req = createMockRequest({
        conversationContext: {
          type: 'conversation',
          data: 'Test context'
        }
      }, {}) as any; // No agentId in params
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.analyzeContext(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });

    it('should handle invalid context format', async () => {
      const req = createMockRequest({
        conversationContext: 'invalid-context-format'
      }, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.analyzeContext(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });

    it('should handle service errors gracefully', async () => {
      // Mock the enhanced service to throw an error
      const mockAgentIntelligenceService = {
        getAgent: vi.fn().mockRejectedValue(new Error('Service unavailable')),
        analyzeContext: vi.fn()
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({
        conversationContext: {
          type: 'conversation',
          data: 'Test context'
        }
      }, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.analyzeContext(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });
  });

  describe('Plan Generation', () => {
    it('should create execution plan successfully', async () => {
      // Mock the agent intelligence service
      const mockAgentIntelligenceService = {
        getAgent: vi.fn().mockResolvedValue({
          id: 'agent-123',
          name: 'Test Agent',
          type: 'analytical',
          status: 'active',
          securityContext: {}
        }),
        generateExecutionPlan: vi.fn().mockResolvedValue({
          id: 'plan-123',
          type: 'analysis',
          steps: [{
            id: 'step-1',
            name: 'Analysis',
            type: 'cognitive'
          }],
          estimatedDuration: 30,
          dependencies: []
        })
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;
      (controller as any).securityValidationService = {
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
      };

      const req = createMockRequest({
        analysis: 'Market analysis',
        userPreferences: {},
        securityContext: {}
      }, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.generatePlan(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          operationPlan: expect.objectContaining({
            id: expect.any(String),
            type: expect.any(String),
            steps: expect.any(Array),
            estimatedDuration: expect.any(Number)
          }),
          estimatedDuration: expect.any(Number),
          riskAssessment: expect.objectContaining({
            level: expect.any(String),
            score: expect.any(Number)
          }),
          approvalRequired: expect.any(Boolean),
          meta: expect.objectContaining({
            timestamp: expect.any(Date),
            agentId: 'agent-123',
            version: expect.any(String)
          })
        })
      });
    });

    it('should validate plan parameters', async () => {
      const req = createMockRequest({
        // Missing required fields
      }, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.generatePlan(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });

    it('should handle high-risk operations', async () => {
      // Mock risk assessment to return high risk
      const mockAgentIntelligenceService = {
        getAgent: vi.fn().mockResolvedValue({
          id: 'agent-123',
          name: 'Test Agent',
          securityContext: {}
        }),
        generateExecutionPlan: vi.fn().mockResolvedValue({
          id: 'plan-123',
          type: 'critical_analysis',
          estimatedDuration: 60,
          dependencies: []
        })
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;
      (controller as any).securityValidationService = {
        assessRisk: vi.fn().mockResolvedValue({
          level: SecurityLevel.HIGH,
          overallRisk: RiskLevel.HIGH,
          score: 85,
          factors: [],
          recommendations: ['Require approval'],
          mitigations: ['Enhanced monitoring'],
          assessedAt: new Date(),
          assessedBy: 'system'
        })
      };

      const req = createMockRequest({
        analysis: 'High-risk critical analysis',
        userPreferences: {},
        securityContext: {}
      }, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.generatePlan(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            riskAssessment: expect.objectContaining({
              level: SecurityLevel.HIGH,
              score: expect.any(Number)
            }),
            approvalRequired: true
          })
        })
      );
    });
  });

  describe('Chat With Agent', () => {
    it('should execute chat successfully', async () => {
      const mockAgentIntelligenceService = {
        getAgentWithPersona: vi.fn().mockResolvedValue({
          id: 'agent-123',
          name: 'Test Agent',
          createdBy: 'user-123',
          personaData: {
            name: 'Test Persona',
            role: 'assistant',
            traits: ['helpful'],
            expertise: ['general'],
            conversationalStyle: 'friendly'
          }
        }),
        generateAgentResponse: vi.fn().mockResolvedValue({
          response: 'Hello! How can I help you today?',
          confidence: 0.9,
          model: 'gpt-4',
          tokensUsed: 25,
          memoryEnhanced: true,
          knowledgeUsed: false
        })
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({
        message: 'Hello, how are you?',
        conversationHistory: [],
        context: 'casual conversation'
      }, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.chatWithAgent(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          agentId: 'agent-123',
          agentName: 'Test Agent',
          response: expect.any(String),
          confidence: expect.any(Number),
          model: expect.any(String),
          tokensUsed: expect.any(Number),
          memoryEnhanced: expect.any(Boolean),
          knowledgeUsed: expect.any(Boolean),
          persona: expect.objectContaining({
            name: expect.any(String),
            role: expect.any(String)
          }),
          conversationContext: expect.objectContaining({
            messageCount: expect.any(Number),
            hasHistory: expect.any(Boolean)
          }),
          timestamp: expect.any(Date)
        })
      });
    });

    it('should validate chat parameters', async () => {
      const req = createMockRequest({
        // Missing message
        conversationHistory: []
      }, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.chatWithAgent(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });

    it('should handle agent not found', async () => {
      const mockAgentIntelligenceService = {
        getAgentWithPersona: vi.fn().mockResolvedValue(null)
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({
        message: 'Hello',
        conversationHistory: []
      }, { agentId: 'nonexistent-agent' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.chatWithAgent(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });

    it('should handle service errors gracefully', async () => {
      const mockAgentIntelligenceService = {
        getAgentWithPersona: vi.fn().mockResolvedValue({
          id: 'agent-123',
          name: 'Test Agent',
          createdBy: 'user-123',
          personaData: null
        }),
        generateAgentResponse: vi.fn().mockRejectedValue(
          new Error('LLM service unavailable')
        )
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({
        message: 'Hello',
        conversationHistory: []
      }, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.chatWithAgent(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });
  });

  describe('Agent Management', () => {
    it('should create agent successfully', async () => {
      const mockAgent = createMockAgent();
      const mockAgentIntelligenceService = {
        createAgent: vi.fn().mockResolvedValue(mockAgent)
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({
        name: 'Test Agent',
        description: 'A test agent',
        role: 'assistant',
        capabilities: ['analysis', 'reasoning'],
        personaId: 'persona-123'
      }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.createAgent(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: expect.any(String),
          name: 'Test Agent',
          type: 'analytical',
          status: 'active',
          meta: expect.objectContaining({
            compositionModel: true,
            personaLinked: expect.any(Boolean),
            transformationApplied: expect.any(Boolean),
            timestamp: expect.any(Date)
          })
        })
      });
    });

    it('should get agent by ID successfully', async () => {
      const mockAgent = createMockAgent();
      const mockAgentIntelligenceService = {
        getAgent: vi.fn().mockResolvedValue(mockAgent)
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({}, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.getAgent(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'agent-123',
          name: expect.any(String),
          type: expect.any(String),
          status: expect.any(String)
        })
      });
    });

    it('should handle agent not found', async () => {
      const mockAgentIntelligenceService = {
        getAgent: vi.fn().mockResolvedValue(null)
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({}, { agentId: 'nonexistent-agent' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.getAgent(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });

    it('should update agent successfully', async () => {
      const mockAgent = createMockAgent({ name: 'Updated Agent' });
      const mockAgentIntelligenceService = {
        updateAgent: vi.fn().mockResolvedValue(mockAgent)
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest(
        {
          name: 'Updated Agent',
          description: 'Updated description'
        },
        { agentId: 'agent-123' }
      ) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.updateAgent(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'agent-123',
          name: 'Updated Agent'
        })
      });
    });

    it('should delete agent successfully', async () => {
      const mockAgentIntelligenceService = {
        deleteAgent: vi.fn().mockResolvedValue(true)
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({}, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.deleteAgent(req, res, next);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should list agents with filtering', async () => {
      const mockAgents = [
        createMockAgent({
          id: 'agent-1',
          name: 'Agent 1',
          role: 'analytical' as any,
          isActive: true
        }),
        createMockAgent({
          id: 'agent-2',
          name: 'Agent 2',
          role: 'analytical' as any,
          isActive: true
        })
      ];
      const mockAgentIntelligenceService = {
        getAgents: vi.fn().mockResolvedValue(mockAgents)
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({}, {}, {
        limit: '10',
        role: 'analytical',
        isActive: 'true'
      }) as any;
      // Mock validated query
      (req as any).validatedQuery = {
        limit: 10,
        role: 'analytical',
        isActive: true
      };
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.getAgents(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          agents: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              name: expect.any(String),
              type: expect.any(String)
            })
          ]),
          total: expect.any(Number),
          filters: expect.any(Object)
        })
      });
    });
  });

  describe('Agent Capabilities', () => {
    it('should get agent capabilities successfully', async () => {
      const mockAgentIntelligenceService = {
        getAgent: vi.fn().mockResolvedValue(createMockAgent())
      };
      const mockCapabilityDiscoveryService = {
        getAgentCapabilities: vi.fn().mockResolvedValue([
          { id: 'cap-1', name: 'analysis', type: 'cognitive' },
          { id: 'cap-2', name: 'reasoning', type: 'logical' }
        ])
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;
      (controller as any).capabilityDiscoveryService = mockCapabilityDiscoveryService;

      const req = createMockRequest({}, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.getAgentCapabilities(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          agentId: 'agent-123',
          capabilities: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              name: expect.any(String),
              type: expect.any(String)
            })
          ]),
          totalCount: expect.any(Number),
          lastUpdated: expect.any(Date),
          enhanced: true
        })
      });
    });

    it('should handle capabilities service error', async () => {
      const mockAgentIntelligenceService = {
        getAgent: vi.fn().mockResolvedValue(createMockAgent())
      };
      const mockCapabilityDiscoveryService = {
        getAgentCapabilities: vi.fn().mockRejectedValue(new Error('Service unavailable'))
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;
      (controller as any).capabilityDiscoveryService = mockCapabilityDiscoveryService;

      const req = createMockRequest({}, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.getAgentCapabilities(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors properly', async () => {
      const req = createMockRequest({
        // Invalid request body - missing required fields
        name: '', // Empty name
        description: 'test'
      }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.createAgent(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });

    it('should handle database connection errors', async () => {
      const mockAgentIntelligenceService = {
        getAgent: vi.fn().mockRejectedValue(
          new Error('Database connection failed')
        )
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({}, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.getAgent(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });

    it('should handle service timeout errors', async () => {
      const mockAgentIntelligenceService = {
        getAgent: vi.fn().mockRejectedValue(
          new Error('Request timeout')
        )
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({
        conversationContext: {
          type: 'conversation',
          data: 'Test context'
        }
      }, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.analyzeContext(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle multiple concurrent requests', async () => {
      const mockAgentIntelligenceService = {
        getAgent: vi.fn().mockResolvedValue(createMockAgent())
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const requests = Array.from({ length: 10 }, (_, i) => ({
        req: createMockRequest({}, { agentId: `agent-${i}` }) as any,
        res: createMockResponse() as any,
        next: createMockNext()
      }));

      const promises = requests.map(({ req, res, next }) =>
        controller.getAgent(req, res, next)
      );

      await Promise.all(promises);

      requests.forEach(({ res }) => {
        expect(res.json).toHaveBeenCalled();
      });
    });

    it('should handle resource-intensive chat operations', async () => {
      const mockAgentIntelligenceService = {
        getAgentWithPersona: vi.fn().mockResolvedValue({
          id: 'agent-123',
          name: 'Test Agent',
          createdBy: 'user-123',
          personaData: {
            name: 'Complex Agent',
            role: 'researcher',
            traits: ['thorough', 'analytical'],
            expertise: ['research', 'analysis'],
            conversationalStyle: 'detailed'
          }
        }),
        generateAgentResponse: vi.fn().mockResolvedValue({
          response: 'This is a comprehensive analysis of the complex topic...',
          confidence: 0.95,
          model: 'gpt-4',
          tokensUsed: 2500,
          memoryEnhanced: true,
          knowledgeUsed: true
        })
      };

      (controller as any).agentIntelligenceService = mockAgentIntelligenceService;

      const req = createMockRequest({
        message: 'Provide a comprehensive analysis of quantum computing trends',
        conversationHistory: [],
        context: 'research analysis'
      }, { agentId: 'agent-123' }) as any;
      const res = createMockResponse() as any;
      const next = createMockNext();

      await controller.chatWithAgent(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            response: expect.any(String),
            tokensUsed: expect.any(Number),
            memoryEnhanced: true,
            knowledgeUsed: true
          })
        })
      );
    });
  });
});