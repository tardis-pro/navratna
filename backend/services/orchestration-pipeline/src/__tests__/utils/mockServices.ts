// @ts-nocheck
import { jest } from '@jest/globals';
import {
  Operation,
  OperationType,
  OperationStatus,
  OperationPriority,
  StepStatus,
  StepResult,
  OperationState,
  Checkpoint,
  CheckpointType,
  OperationResult,
  WorkflowInstance,
} from '@uaip/types';

// Mock DatabaseService
export const createMockDatabaseService = (): any => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  healthCheck: jest.fn().mockResolvedValue({
    status: 'healthy',
    details: {
      connected: true,
      totalConnections: 1,
      idleConnections: 0,
      waitingConnections: 0,
      responseTime: 5,
    },
  }),
  close: jest.fn().mockResolvedValue(undefined),

  // Operation methods
  getOperation: jest.fn().mockResolvedValue({
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
  saveStepResult: jest.fn().mockResolvedValue(undefined),
  updateOperationResult: jest.fn().mockResolvedValue(undefined),
});

// Mock EventBusService
export const createMockEventBusService = (): any => ({
  connect: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  publishEvent: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue(undefined),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock StateManagerService
export const createMockStateManagerService = (): any => ({
  initializeOperationState: jest.fn().mockResolvedValue(undefined),
  updateOperationState: jest.fn().mockResolvedValue(undefined),
  getOperationState: jest.fn().mockResolvedValue({
    operationId: 'operation-123',
    status: OperationStatus.RUNNING,
    currentStep: 'step-1',
    completedSteps: [],
    failedSteps: [],
    variables: {},
    checkpoints: [],
    lastUpdated: new Date(),
  }),
  saveCheckpoint: jest.fn().mockResolvedValue(undefined),
  restoreFromCheckpoint: jest.fn().mockResolvedValue({
    operationId: 'operation-123',
    status: OperationStatus.RUNNING,
    completedSteps: ['step-1'],
    failedSteps: [],
    variables: { var1: 'value1' },
    checkpoints: [],
    lastUpdated: new Date(),
  }),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock ResourceManagerService
export const createMockResourceManagerService = (): any => ({
  checkResourceAvailability: jest.fn().mockResolvedValue({
    available: true,
    allocatedCpu: 1,
    allocatedMemory: 512 * 1024 * 1024,
    reason: 'Resources available',
  }),
  allocateResources: jest.fn().mockResolvedValue({
    allocationId: 'allocation-123',
    operationId: 'operation-123',
    allocatedCpu: 2,
    allocatedMemory: 1024 * 1024 * 1024,
    allocatedAt: new Date(),
  }),
  releaseResources: jest.fn().mockResolvedValue(undefined),
  getResourceUsage: jest.fn().mockResolvedValue({
    cpu: 1.5,
    memory: 512 * 1024 * 1024,
    network: 0,
  }),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock StepExecutorService
export const createMockStepExecutorService = (): any => ({
  executeStep: jest.fn().mockResolvedValue({
    stepId: 'step-1',
    status: StepStatus.COMPLETED,
    data: { result: 'success' },
    executionTime: 1500,
    metadata: {
      startedAt: new Date(),
      completedAt: new Date(),
    },
  }),
  cancelStep: jest.fn().mockResolvedValue(undefined),
  forceStopStep: jest.fn().mockResolvedValue(undefined),
  getStepStatus: jest.fn().mockResolvedValue({
    stepId: 'step-1',
    status: StepStatus.RUNNING,
    progress: 50,
  }),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock CompensationService
export const createMockCompensationService = (): any => ({
  createCompensationPlan: jest.fn().mockResolvedValue({
    id: 'compensation-123',
    operationId: 'operation-123',
    actions: [{ type: 'rollback', stepId: 'step-1', description: 'Rollback step 1' }],
  }),
  executeCompensation: jest.fn().mockResolvedValue({
    compensationId: 'compensation-123',
    status: 'completed',
    executedActions: 1,
    failedActions: 0,
  }),
  getCompensationStatus: jest.fn().mockResolvedValue({
    id: 'compensation-123',
    status: 'pending',
  }),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock OperationManagementService
export const createMockOperationManagementService = (): any => ({
  createOperation: jest.fn().mockResolvedValue({
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
  getOperation: jest.fn().mockResolvedValue({
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
  updateOperation: jest.fn().mockResolvedValue(undefined),
  deleteOperation: jest.fn().mockResolvedValue(undefined),
  createOperationState: jest.fn().mockResolvedValue({
    id: 'state-123',
    operationId: 'operation-123',
    status: OperationStatus.PENDING,
    metadata: {
      startTime: new Date(),
      priority: 'normal',
    },
  }),
  updateOperationState: jest.fn().mockResolvedValue(undefined),
  createWorkflowInstance: jest.fn().mockResolvedValue({
    id: 'workflow-123',
    operationId: 'operation-123',
    status: OperationStatus.QUEUED,
    createdAt: new Date(),
  }),
  createCheckpoint: jest.fn().mockResolvedValue({
    id: 'checkpoint-123',
    stepId: 'step-1',
    type: CheckpointType.PROGRESS_MARKER,
    data: {},
    timestamp: new Date(),
  }),
  createStepResult: jest.fn().mockResolvedValue({
    id: 'result-123',
    stepId: 'step-1',
    status: StepStatus.COMPLETED,
    data: { result: 'success' },
    executionTime: 1500,
  }),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
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
export const createMockConfig = (): any => ({
  getExecutionConfig: jest.fn().mockReturnValue({
    operationTimeoutMax: 3600000,
    cleanupOrphanedOperationsInterval: 300000,
    maxParallelSteps: 10,
    defaultRetryAttempts: 3,
  }),
});
