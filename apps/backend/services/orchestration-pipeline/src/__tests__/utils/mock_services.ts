// @ts-nocheck
import {
  Operation,
  OperationType,
  OperationStatus,
  OperationPriority,
  StepStatus,
  StepResult,
  CheckpointType,
  WorkflowInstance,
} from '@uaip/types';

// Mock DatabaseService
export const createMockDatabaseService = (): Record<string, unknown> => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  healthCheck: vi.fn().mockResolvedValue({
    status: 'healthy',
    details: {
      connected: true,
      totalConnections: 1,
      idleConnections: 0,
      waitingConnections: 0,
      responseTime: 5,
    },
  }),
  close: vi.fn().mockResolvedValue(undefined),

  // Operation methods
  getOperation: vi.fn().mockResolvedValue({
    id: 'operation-123',
    type: OperationType.TOOL_EXECUTION,
    agentId: 'agent-123',
    status: OperationStatus.PENDING,
    executionPlan: {
      steps: [
        { id: 'step-1', name: 'Test Step', type: 'tool', timeout: 30000 },
        { id: 'step-2', name: 'Another Step', type: 'validation', timeout: 15000 },
      ],
      dependencies: [],
    },
    createdAt: new Date(),
    estimatedDuration: 60000,
  }),
  saveStepResult: vi.fn().mockResolvedValue(undefined),
  updateOperationResult: vi.fn().mockResolvedValue(undefined),
});

// Mock EventBusService
export const createMockEventBusService = (): Record<string, unknown> => ({
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  publishEvent: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock StateManagerService
export const createMockStateManagerService = (): Record<string, unknown> => ({
  initializeOperationState: vi.fn().mockResolvedValue(undefined),
  updateOperationState: vi.fn().mockResolvedValue(undefined),
  getOperationState: vi.fn().mockResolvedValue({
    operationId: 'operation-123',
    status: OperationStatus.RUNNING,
    currentStep: 'step-1',
    completedSteps: [],
    failedSteps: [],
    variables: {},
    checkpoints: [],
    lastUpdated: new Date(),
  }),
  saveCheckpoint: vi.fn().mockResolvedValue(undefined),
  restoreFromCheckpoint: vi.fn().mockResolvedValue({
    operationId: 'operation-123',
    status: OperationStatus.RUNNING,
    completedSteps: ['step-1'],
    failedSteps: [],
    variables: { var1: 'value1' },
    checkpoints: [],
    lastUpdated: new Date(),
  }),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock ResourceManagerService
export const createMockResourceManagerService = (): Record<string, unknown> => ({
  checkResourceAvailability: vi.fn().mockResolvedValue({
    available: true,
    allocatedCpu: 1,
    allocatedMemory: 512 * 1024 * 1024,
    reason: 'Resources available',
  }),
  allocateResources: vi.fn().mockResolvedValue({
    allocationId: 'allocation-123',
    operationId: 'operation-123',
    allocatedCpu: 2,
    allocatedMemory: 1024 * 1024 * 1024,
    allocatedAt: new Date(),
  }),
  releaseResources: vi.fn().mockResolvedValue(undefined),
  getResourceUsage: vi.fn().mockResolvedValue({
    cpu: 1.5,
    memory: 512 * 1024 * 1024,
    network: 0,
  }),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock StepExecutorService
export const createMockStepExecutorService = (): Record<string, unknown> => ({
  executeStep: vi.fn().mockResolvedValue({
    stepId: 'step-1',
    status: StepStatus.COMPLETED,
    data: { result: 'success' },
    executionTime: 1500,
    metadata: {
      startedAt: new Date(),
      completedAt: new Date(),
    },
  }),
  cancelStep: vi.fn().mockResolvedValue(undefined),
  forceStopStep: vi.fn().mockResolvedValue(undefined),
  getStepStatus: vi.fn().mockResolvedValue({
    stepId: 'step-1',
    status: StepStatus.RUNNING,
    progress: 50,
  }),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock CompensationService
export const createMockCompensationService = (): Record<string, unknown> => ({
  createCompensationPlan: vi.fn().mockResolvedValue({
    id: 'compensation-123',
    operationId: 'operation-123',
    actions: [{ type: 'rollback', stepId: 'step-1', description: 'Rollback step 1' }],
  }),
  executeCompensation: vi.fn().mockResolvedValue({
    compensationId: 'compensation-123',
    status: 'completed',
    executedActions: 1,
    failedActions: 0,
  }),
  getCompensationStatus: vi.fn().mockResolvedValue({
    id: 'compensation-123',
    status: 'pending',
  }),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock OperationManagementService
export const createMockOperationManagementService = (): Record<string, unknown> => ({
  createOperation: vi.fn().mockResolvedValue({
    id: 'operation-123',
    type: OperationType.TOOL_EXECUTION,
    agentId: 'agent-123',
    status: OperationStatus.PENDING,
    executionPlan: {
      steps: [
        { id: 'step-1', name: 'Test Step', type: 'tool' },
        { id: 'step-2', name: 'Another Step', type: 'validation' },
      ],
      dependencies: [],
    },
    createdAt: new Date(),
    estimatedDuration: 60000,
  }),
  getOperation: vi.fn().mockResolvedValue({
    id: 'operation-123',
    type: OperationType.TOOL_EXECUTION,
    agentId: 'agent-123',
    status: OperationStatus.PENDING,
    executionPlan: {
      steps: [
        { id: 'step-1', name: 'Test Step', type: 'tool' },
        { id: 'step-2', name: 'Another Step', type: 'validation' },
      ],
      dependencies: [],
    },
    createdAt: new Date(),
    estimatedDuration: 60000,
  }),
  updateOperation: vi.fn().mockResolvedValue(undefined),
  deleteOperation: vi.fn().mockResolvedValue(undefined),
  createOperationState: vi.fn().mockResolvedValue({
    id: 'state-123',
    operationId: 'operation-123',
    status: OperationStatus.PENDING,
    metadata: {
      startTime: new Date(),
      priority: 'normal',
    },
  }),
  updateOperationState: vi.fn().mockResolvedValue(undefined),
  createWorkflowInstance: vi.fn().mockResolvedValue({
    id: 'workflow-123',
    operationId: 'operation-123',
    status: OperationStatus.QUEUED,
    createdAt: new Date(),
  }),
  createCheckpoint: vi.fn().mockResolvedValue({
    id: 'checkpoint-123',
    stepId: 'step-1',
    type: CheckpointType.PROGRESS_MARKER,
    data: {},
    timestamp: new Date(),
  }),
  createStepResult: vi.fn().mockResolvedValue({
    id: 'result-123',
    stepId: 'step-1',
    status: StepStatus.COMPLETED,
    data: { result: 'success' },
    executionTime: 1500,
  }),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
});

// Utility to create a mock operation
export const createMockOperation = (overrides: Partial<Operation> = {}): Operation => ({
  id: 'operation-123',
  type: OperationType.TOOL_EXECUTION,
  agentId: 'agent-123',
  status: OperationStatus.PENDING,
  executionPlan: {
    steps: [
      {
        id: 'step-1',
        description: 'Test Step',
        type: 'tool',
        estimatedDuration: 30000,
        required: true,
      },
      {
        id: 'step-2',
        description: 'Another Step',
        type: 'validation',
        estimatedDuration: 15000,
        required: false,
      },
    ],
    dependencies: [],
  },
  context: {
    executionContext: {
      agentId: 'agent-123',
      userId: 'user-123',
      environment: 'development' as const,
      timeout: 300000,
      resourceLimits: {
        maxMemory: 1024 * 1024 * 1024,
        maxCpu: 2,
        maxDuration: 3600000,
      },
    },
  },
  metadata: {
    priority: OperationPriority.MEDIUM,
    tags: [],
    environment: 'test',
  },
  createdAt: new Date('2023-01-01'),
  estimatedDuration: 60000,
  ...overrides,
});

// Utility to create a mock workflow instance
export const createMockWorkflowInstance = (
  overrides: Partial<WorkflowInstance> = {}
): WorkflowInstance => ({
  id: 'workflow-123',
  operationId: 'operation-123',
  status: OperationStatus.QUEUED,
  currentStepIndex: 0,
  executionContext: {
    agentId: 'agent-123',
    userId: 'user-123',
    environment: 'development' as const,
    timeout: 300000,
    resourceLimits: {
      maxMemory: 1024 * 1024 * 1024,
      maxCpu: 2,
      maxDuration: 3600000,
    },
  },
  state: {
    operationId: 'operation-123',
    status: OperationStatus.QUEUED,
    completedSteps: [],
    failedSteps: [],
    variables: {},
    checkpoints: [],
    lastUpdated: new Date('2023-01-01'),
  },
  createdAt: new Date('2023-01-01'),
  updatedAt: new Date('2023-01-01'),
  ...overrides,
});

// Utility to create a mock step result
export const createMockStepResult = (overrides: Partial<StepResult> = {}): StepResult => ({
  stepId: 'step-1',
  status: StepStatus.COMPLETED,
  data: { result: 'success' },
  executionTime: 1500,
  metadata: {
    startedAt: new Date('2023-01-01'),
    completedAt: new Date('2023-01-01'),
  },
  ...overrides,
});

// Mock config service
export const createMockConfig = (): Record<string, unknown> => ({
  getExecutionConfig: vi.fn().mockReturnValue({
    operationTimeoutMax: 3600000,
    cleanupOrphanedOperationsInterval: 300000,
    maxParallelSteps: 10,
    defaultRetryAttempts: 3,
  }),
});
