// Tool-related type definitions
// Part of @uaip/types shared package

// Tool enums
export enum ToolCategory {
  GENERAL = 'general',
  DEVELOPMENT = 'development',
  ANALYSIS = 'analysis',
  VISUALIZATION = 'visualization',
  REPORTING = 'reporting',
  INTEGRATION = 'integration',
  PROCESSING = 'processing',
  STORAGE = 'storage',
  CODE_GENERATOR = 'code_generator',
  WORKFLOW_ORCHESTRATOR = 'workflow_orchestrator',
  SEARCH = 'search',
  MONITORING = 'monitoring',
  DATA_ANALYZER = 'data_analyzer',
  COMMUNICATION = 'communication',
  AUTOMATION = 'automation',
  SECURITY = 'security',
  DATA = 'data',
  AI = 'ai',
}

export enum ToolExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  APPROVAL_REQUIRED = 'approval-required',
}

// Tool type definitions
export interface JSONSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface ToolExample {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  expectedResult?: unknown;
}

export interface ToolExecutionError {
  type: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
  suggestedAction?: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  parameters: Record<string, unknown>;
  returnType?: Record<string, unknown>;
  securityLevel: 'safe' | 'moderate' | 'restricted' | 'dangerous';
  requiresApproval: boolean;
  isEnabled: boolean;
  executionTimeEstimate?: number;
  costEstimate?: number;
  author: string;
  tags: string[];
  dependencies: string[];
  rateLimits?: Record<string, unknown>;
  examples: Array<Record<string, unknown>>;
}

export interface ToolError {
  type: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
  suggestedAction?: string;
}

export interface ToolExecution {
  id: string;
  toolId: string;
  agentId: string;
  parameters: Record<string, unknown>;
  status: ToolExecutionStatus;
  startTime: Date;
  endTime?: Date;
  result?: unknown;
  error?: ToolError;
  approvalRequired: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  cost?: number;
  executionTimeMs?: number;
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, unknown>;
}

export interface ToolUsageRecord {
  toolId: string;
  agentId: string;
  timestamp: Date;
  success: boolean;
  executionTime?: number;
  cost?: number;
  errorType?: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ToolPermission {
  agentId: string;
  toolId: string;
  permissionType: 'allow' | 'deny' | 'require_approval';
  maxCostPerHour?: number;
  maxExecutionsPerHour?: number;
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export interface ToolBudget {
  agentId: string;
  dailyLimit?: number;
  hourlyLimit?: number;
  currentDailySpent: number;
  currentHourlySpent: number;
  dailyResetTime?: Date;
  hourlyResetTime?: Date;
}
