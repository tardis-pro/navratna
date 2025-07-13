import { vi } from 'vitest';
import { Agent, AgentStatus, SecurityLevel, RiskLevel } from '@uaip/types';

// Mock DatabaseService
export const createMockDatabaseService = (): any => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  healthCheck: vi.fn().mockResolvedValue({
    status: 'healthy',
    details: {
      connected: true,
      totalConnections: 1,
      idleConnections: 0,
      waitingConnections: 0,
      responseTime: 5
    }
  }),
  close: vi.fn().mockResolvedValue(undefined),
  createAgent: vi.fn().mockResolvedValue({
    id: 'agent-123',
    name: 'Test Agent',
    type: 'analytical',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  }),
  getAgentById: vi.fn().mockResolvedValue({
    id: 'agent-123',
    name: 'Test Agent',
    type: 'analytical',
    status: 'active'
  }),
  updateAgent: vi.fn().mockResolvedValue({
    id: 'agent-123',
    name: 'Updated Agent',
    type: 'analytical',
    status: 'active'
  }),
  deleteAgent: vi.fn().mockResolvedValue(true),
  findAgents: vi.fn().mockResolvedValue([
    {
      id: 'agent-123',
      name: 'Test Agent',
      type: 'analytical',
      status: 'active'
    }
  ])
});

// Mock EventBusService
export const createMockEventBusService = (): any => ({
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' })
});

// Mock PersonaService
export const createMockPersonaService = (): any => ({
  createPersona: vi.fn().mockResolvedValue({
    id: 'persona-123',
    name: 'Test Persona',
    description: 'A test persona',
    traits: ['analytical', 'precise'],
    instructions: 'Test instructions',
    createdAt: new Date()
  }),
  getPersonaById: vi.fn().mockResolvedValue({
    id: 'persona-123',
    name: 'Test Persona',
    description: 'A test persona'
  }),
  updatePersona: vi.fn().mockResolvedValue({
    id: 'persona-123',
    name: 'Updated Persona'
  }),
  deletePersona: vi.fn().mockResolvedValue(true),
  listPersonas: vi.fn().mockResolvedValue([
    {
      id: 'persona-123',
      name: 'Test Persona'
    }
  ])
});

// Mock DiscussionService
export const createMockDiscussionService = (): any => ({
  createDiscussion: vi.fn().mockResolvedValue({
    id: 'discussion-123',
    title: 'Test Discussion',
    topic: 'Test Topic',
    status: 'draft',
    participants: [],
    createdAt: new Date()
  }),
  getDiscussion: vi.fn().mockResolvedValue({
    id: 'discussion-123',
    title: 'Test Discussion',
    status: 'active'
  }),
  updateDiscussion: vi.fn().mockResolvedValue({
    id: 'discussion-123',
    title: 'Updated Discussion'
  }),
  startDiscussion: vi.fn().mockResolvedValue({
    id: 'discussion-123',
    status: 'active'
  }),
  endDiscussion: vi.fn().mockResolvedValue({
    id: 'discussion-123',
    status: 'completed'
  }),
  addParticipant: vi.fn().mockResolvedValue({
    id: 'participant-123',
    discussionId: 'discussion-123',
    agentId: 'agent-123',
    role: 'participant'
  })
});

// Mock KnowledgeGraphService
export const createMockKnowledgeGraphService = (): any => ({
  addNode: vi.fn().mockResolvedValue({ id: 'node-123' }),
  addRelationship: vi.fn().mockResolvedValue({ id: 'rel-123' }),
  findNodes: vi.fn().mockResolvedValue([]),
  getNodeById: vi.fn().mockResolvedValue({ id: 'node-123' }),
  updateNode: vi.fn().mockResolvedValue({ id: 'node-123' }),
  deleteNode: vi.fn().mockResolvedValue(true),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' })
});

// Mock AgentMemoryService
export const createMockAgentMemoryService = (): any => ({
  storeMemory: vi.fn().mockResolvedValue({
    id: 'memory-123',
    agentId: 'agent-123',
    content: 'Test memory',
    type: 'interaction'
  }),
  retrieveMemories: vi.fn().mockResolvedValue([
    {
      id: 'memory-123',
      agentId: 'agent-123',
      content: 'Test memory'
    }
  ]),
  searchMemories: vi.fn().mockResolvedValue([]),
  deleteMemory: vi.fn().mockResolvedValue(true),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' })
});

// Mock CapabilityDiscoveryService
export const createMockCapabilityDiscoveryService = (): any => ({
  discoverCapabilities: vi.fn().mockResolvedValue([
    {
      id: 'capability-123',
      name: 'analysis',
      type: 'cognitive',
      confidence: 0.9
    }
  ]),
  analyzeAgentCapabilities: vi.fn().mockResolvedValue({
    agentId: 'agent-123',
    capabilities: ['analysis', 'reasoning'],
    strengths: ['logical thinking'],
    limitations: ['emotional analysis']
  })
});

// Mock SecurityValidationService
export const createMockSecurityValidationService = (): any => ({
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
  }),
  filterSensitiveData: vi.fn().mockImplementation((data) => data),
  createApprovalWorkflow: vi.fn().mockResolvedValue('workflow-123')
});

// --- Mocks for Refactored Agent Intelligence Services ---

export const createMockAgentCoreService = () => ({
  listAgents: vi.fn().mockResolvedValue([createMockAgent()]),
  getAgent: vi.fn().mockResolvedValue(createMockAgent()),
  createAgent: vi.fn().mockResolvedValue(createMockAgent()),
  updateAgent: vi.fn().mockResolvedValue(createMockAgent({ name: 'Updated Agent' })),
  deleteAgent: vi.fn().mockResolvedValue(undefined),
  getAgentCapabilities: vi.fn().mockResolvedValue([]),
  getAgentWithPersona: vi.fn().mockResolvedValue({ ...createMockAgent(), personaData: {} }),
});

export const createMockAgentContextService = () => ({
  analyzeContext: vi.fn().mockResolvedValue({
    analysis: 'Context analysis result',
    recommendations: ['action1', 'action2'],
    confidence: 0.85,
    explanation: 'Test explanation'
  }),
});

export const createMockAgentPlanningService = () => ({
  generateExecutionPlan: vi.fn().mockResolvedValue({
    id: 'plan-123',
    type: 'analysis',
    steps: [{ id: 'step-1', name: 'Analysis', type: 'cognitive' }],
    estimatedDuration: 30,
    dependencies: []
  }),
});

export const createMockAgentLearningService = () => ({
  processLearningData: vi.fn().mockResolvedValue({ success: true }),
  learnFromOperation: vi.fn().mockResolvedValue({ learningApplied: true }),
});

export const createMockAgentDiscussionService = () => ({
  processDiscussionMessage: vi.fn().mockResolvedValue({ response: 'Hello there!' }),
  participateInDiscussion: vi.fn().mockResolvedValue({ response: 'I agree.' }),
  generateAgentResponse: vi.fn().mockResolvedValue({ response: 'Thinking...' }),
});

export const createMockAgentEventOrchestrator = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
  publishEvent: vi.fn().mockResolvedValue(undefined),
});

// Utility to create a complete mock agent
export const createMockAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'agent-123',
  name: 'Test Agent',
  role: 'analyst' as any,
  status: AgentStatus.ACTIVE,
  configuration: {
    model: 'gpt-4',
    temperature: 0.7,
    analysisDepth: 'intermediate',
    contextWindowSize: 4000,
    decisionThreshold: 0.7,
    learningEnabled: true,
    collaborationMode: 'collaborative'
  },
  securityContext: {
    securityLevel: 'medium',
    allowedCapabilities: ['analysis', 'reasoning'],
    approvalRequired: false,
    auditLevel: 'standard'
  },
  createdAt: new Date('2023-01-01'),
  updatedAt: new Date('2023-01-01'),
  ...overrides
});