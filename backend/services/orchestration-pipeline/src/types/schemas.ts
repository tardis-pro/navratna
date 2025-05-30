import Joi from 'joi';

// Base schema components
const uuidSchema = Joi.string().uuid().required();
const timestampSchema = Joi.date().iso();

// Resource Limits Schema
export const resourceLimitsSchema = Joi.object({
  maxMemory: Joi.number().integer().min(0).required(),
  maxCpu: Joi.number().min(0).required(),
  maxDuration: Joi.number().integer().min(0).required(),
  maxConcurrency: Joi.number().integer().min(1).required()
});

// Retry Policy Schema
export const retryPolicySchema = Joi.object({
  maxAttempts: Joi.number().integer().min(0).max(10).required(),
  backoffStrategy: Joi.string().valid('linear', 'exponential', 'custom').required(),
  baseDelay: Joi.number().integer().min(0).required(),
  maxDelay: Joi.number().integer().min(0).required(),
  retryableErrors: Joi.array().items(Joi.string()).default([])
});

// Security Context Schema
export const securityContextSchema = Joi.object({
  userId: uuidSchema,
  agentId: uuidSchema,
  permissions: Joi.array().items(Joi.string()).required(),
  riskLevel: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
  requiresApproval: Joi.boolean().required(),
  approvalWorkflowId: Joi.string().uuid().optional()
});

// Execution Context Schema
export const executionContextSchema = Joi.object({
  resourceLimits: resourceLimitsSchema.required(),
  timeout: Joi.number().integer().min(0).required(),
  retryPolicy: retryPolicySchema.required(),
  priority: Joi.string().valid('low', 'normal', 'high', 'critical').required(),
  executionMode: Joi.string().valid('synchronous', 'asynchronous', 'streaming').required()
});

// Operation Context Schema
export const operationContextSchema = Joi.object({
  conversationId: uuidSchema,
  sessionId: uuidSchema,
  userRequest: Joi.string().min(1).max(10000).required(),
  environment: Joi.string().valid('development', 'staging', 'production').required(),
  constraints: Joi.object().pattern(Joi.string(), Joi.any()).default({}),
  securityContext: securityContextSchema.required(),
  executionContext: executionContextSchema.required()
});

// Step Configuration Schema
export const stepConfigurationSchema = Joi.object({
  toolId: Joi.string().optional(),
  artifactTemplateId: Joi.string().optional(),
  apiEndpoint: Joi.string().uri().optional(),
  transformFunction: Joi.string().optional(),
  conditionExpression: Joi.string().optional(),
  delayDuration: Joi.number().integer().min(0).optional(),
  approvalRequirements: Joi.object({
    requiredApprovers: Joi.array().items(uuidSchema).required(),
    minimumApprovals: Joi.number().integer().min(1).required(),
    approvalTimeout: Joi.number().integer().min(0).required(),
    escalationRules: Joi.array().items(Joi.object({
      condition: Joi.string().required(),
      escalateToRoles: Joi.array().items(Joi.string()).required(),
      delayMinutes: Joi.number().integer().min(0).required()
    })).default([])
  }).optional(),
  customConfig: Joi.object().pattern(Joi.string(), Joi.any()).optional()
});

// Step Condition Schema
export const stepConditionSchema = Joi.object({
  expression: Joi.string().required(),
  variables: Joi.object().pattern(Joi.string(), Joi.any()).default({}),
  defaultValue: Joi.boolean().required()
});

// Compensation Step Schema
export const compensationStepSchema = Joi.object({
  id: uuidSchema,
  stepId: uuidSchema,
  action: Joi.string().valid('rollback', 'cleanup', 'notify', 'custom').required(),
  configuration: Joi.object().pattern(Joi.string(), Joi.any()).default({})
});

// Execution Step Schema
export const executionStepSchema = Joi.object({
  id: uuidSchema,
  name: Joi.string().min(1).max(255).required(),
  type: Joi.string().valid(
    'tool_call', 'artifact_generate', 'api_request', 'data_transform',
    'condition_check', 'delay', 'parallel_group', 'approval_request'
  ).required(),
  order: Joi.number().integer().min(0).required(),
  description: Joi.string().max(1000).default(''),
  configuration: stepConfigurationSchema.required(),
  inputMapping: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
  outputMapping: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
  condition: stepConditionSchema.optional(),
  timeout: Joi.number().integer().min(0).required(),
  retryPolicy: retryPolicySchema.required(),
  compensation: compensationStepSchema.required()
});

// Step Dependency Schema
export const stepDependencySchema = Joi.object({
  stepId: uuidSchema,
  dependsOn: Joi.array().items(uuidSchema).required(),
  dependencyType: Joi.string().valid('sequential', 'data', 'resource').required()
});

// Parallel Group Schema
export const parallelGroupSchema = Joi.object({
  id: uuidSchema,
  stepIds: Joi.array().items(uuidSchema).min(2).required(),
  executionPolicy: Joi.string().valid('all_success', 'any_success', 'best_effort').required(),
  maxConcurrency: Joi.number().integer().min(1).required(),
  failurePolicy: Joi.string().valid('fail_fast', 'continue', 'retry_failed').required()
});

// Checkpoint Schema
export const checkpointSchema = Joi.object({
  id: uuidSchema,
  stepId: uuidSchema,
  type: Joi.string().valid('state_snapshot', 'progress_marker', 'recovery_point').required(),
  data: Joi.object().pattern(Joi.string(), Joi.any()).default({}),
  timestamp: timestampSchema.required()
});

// Execution Plan Schema
export const executionPlanSchema = Joi.object({
  steps: Joi.array().items(executionStepSchema).min(1).required(),
  dependencies: Joi.array().items(stepDependencySchema).default([]),
  compensationSteps: Joi.array().items(compensationStepSchema).default([]),
  parallelGroups: Joi.array().items(parallelGroupSchema).default([]),
  checkpoints: Joi.array().items(checkpointSchema).default([])
});

// Business Impact Schema
export const businessImpactSchema = Joi.object({
  category: Joi.string().required(),
  severity: Joi.string().valid('low', 'medium', 'high').required(),
  affectedSystems: Joi.array().items(Joi.string()).default([]),
  estimatedUsers: Joi.number().integer().min(0).default(0)
});

// Operation Metadata Schema
export const operationMetadataSchema = Joi.object({
  version: Joi.string().required(),
  source: Joi.string().required(),
  tags: Joi.array().items(Joi.string()).default([]),
  priority: Joi.string().valid('low', 'normal', 'high', 'critical').required(),
  estimatedCost: Joi.number().min(0).default(0),
  actualCost: Joi.number().min(0).optional(),
  businessImpact: businessImpactSchema.required()
});

// Operation Schema
export const operationSchema = Joi.object({
  id: uuidSchema,
  type: Joi.string().valid(
    'tool_execution', 'artifact_generation', 'hybrid_workflow',
    'approval_workflow', 'composite_operation'
  ).required(),
  status: Joi.string().valid(
    'queued', 'running', 'paused', 'completed', 'failed',
    'cancelled', 'waiting_approval', 'compensating'
  ).required(),
  agentId: uuidSchema,
  userId: uuidSchema,
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).default(''),
  context: operationContextSchema.required(),
  executionPlan: executionPlanSchema.required(),
  results: Joi.object().optional(),
  metadata: operationMetadataSchema.required(),
  createdAt: timestampSchema.required(),
  startedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional(),
  estimatedDuration: Joi.number().integer().min(0).optional(),
  actualDuration: Joi.number().integer().min(0).optional()
});

// API Request Schemas

// Execute Operation Request
export const executeOperationRequestSchema = Joi.object({
  operation: Joi.object({
    type: Joi.string().valid(
      'tool_execution', 'artifact_generation', 'hybrid_workflow',
      'approval_workflow', 'composite_operation'
    ).required(),
    agentId: uuidSchema,
    userId: uuidSchema,
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(1000).default(''),
    context: operationContextSchema.required(),
    executionPlan: executionPlanSchema.required(),
    metadata: operationMetadataSchema.required()
  }).required(),
  options: Joi.object({
    priority: Joi.string().valid('low', 'normal', 'high', 'critical').default('normal'),
    async: Joi.boolean().default(true),
    webhookUrl: Joi.string().uri().optional(),
    tags: Joi.array().items(Joi.string()).default([])
  }).default({})
});

// Update Operation Status Request
export const updateOperationStatusRequestSchema = Joi.object({
  status: Joi.string().valid(
    'queued', 'running', 'paused', 'completed', 'failed',
    'cancelled', 'waiting_approval', 'compensating'
  ).required(),
  reason: Joi.string().max(500).optional(),
  metadata: Joi.object().pattern(Joi.string(), Joi.any()).optional()
});

// Create Checkpoint Request
export const createCheckpointRequestSchema = Joi.object({
  operationId: uuidSchema,
  stepId: uuidSchema,
  type: Joi.string().valid('state_snapshot', 'progress_marker', 'recovery_point').required(),
  data: Joi.object().pattern(Joi.string(), Joi.any()).required()
});

// Resume Operation Request
export const resumeOperationRequestSchema = Joi.object({
  operationId: uuidSchema,
  checkpointId: Joi.string().uuid().optional(),
  stepId: Joi.string().uuid().optional(),
  modifications: Joi.object({
    context: Joi.object().optional(),
    executionPlan: Joi.object().optional(),
    metadata: Joi.object().optional()
  }).optional()
});

// Cancel Operation Request
export const cancelOperationRequestSchema = Joi.object({
  operationId: uuidSchema,
  reason: Joi.string().max(500).required(),
  compensate: Joi.boolean().default(true),
  force: Joi.boolean().default(false)
});

// Search Operations Request
export const searchOperationsRequestSchema = Joi.object({
  filters: Joi.object({
    status: Joi.array().items(Joi.string().valid(
      'queued', 'running', 'paused', 'completed', 'failed',
      'cancelled', 'waiting_approval', 'compensating'
    )).optional(),
    type: Joi.array().items(Joi.string().valid(
      'tool_execution', 'artifact_generation', 'hybrid_workflow',
      'approval_workflow', 'composite_operation'
    )).optional(),
    agentId: Joi.array().items(uuidSchema).optional(),
    userId: Joi.array().items(uuidSchema).optional(),
    priority: Joi.array().items(Joi.string().valid('low', 'normal', 'high', 'critical')).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    dateRange: Joi.object({
      startDate: timestampSchema.required(),
      endDate: timestampSchema.required()
    }).optional()
  }).default({}),
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'status', 'priority').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }).default({})
});

// Bulk Operations Request
export const bulkOperationsRequestSchema = Joi.object({
  operationIds: Joi.array().items(uuidSchema).min(1).max(50).required(),
  action: Joi.string().valid('cancel', 'pause', 'resume', 'retry').required(),
  options: Joi.object({
    reason: Joi.string().max(500).optional(),
    force: Joi.boolean().default(false),
    compensate: Joi.boolean().default(true)
  }).default({})
});

// Workflow Templates
export const workflowTemplateSchema = Joi.object({
  id: uuidSchema,
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).default(''),
  category: Joi.string().required(),
  version: Joi.string().required(),
  executionPlan: executionPlanSchema.required(),
  parameters: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    type: Joi.string().valid('string', 'number', 'boolean', 'object', 'array').required(),
    required: Joi.boolean().default(false),
    defaultValue: Joi.any().optional(),
    description: Joi.string().optional()
  })).default([]),
  metadata: operationMetadataSchema.required(),
  createdAt: timestampSchema.required(),
  updatedAt: timestampSchema.required()
});

// Parameter Validation
export const validateParameter = (parameterDefinition: any, value: any) => {
  const { type, required } = parameterDefinition;
  
  let schema: Joi.Schema;
  
  switch (type) {
    case 'string':
      schema = Joi.string();
      break;
    case 'number':
      schema = Joi.number();
      break;
    case 'boolean':
      schema = Joi.boolean();
      break;
    case 'object':
      schema = Joi.object();
      break;
    case 'array':
      schema = Joi.array();
      break;
    default:
      schema = Joi.any();
  }
  
  if (required) {
    schema = schema.required();
  } else {
    schema = schema.optional();
  }
  
  return schema.validate(value);
}; 