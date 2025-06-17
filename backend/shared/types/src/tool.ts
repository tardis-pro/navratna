// Tool System Type Definitions for Council of Nycea
// This file defines the comprehensive type system for agent tooling capabilities

export type ToolCategory = 
  | 'api' | 'computation' | 'file-system' | 'database' 
  | 'web-search' | 'code-execution' | 'communication' 
  | 'knowledge-graph' | 'deployment' | 'monitoring'
  | 'analysis' | 'generation';

export type ToolExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'approval-required';

export type SecurityLevel = 'low' | 'medium' | 'high' | 'critical';

// JSON Schema interface for tool parameters and return types
export interface JSONSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  description?: string;
  examples?: any[];
  additionalProperties?: boolean;
}

// Tool example for documentation and testing
export interface ToolExample {
  name: string;
  description: string;
  parameters: Record<string, any>;
  expectedResult?: any;
  notes?: string;
}

// Tool execution error details
export interface ToolExecutionError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
  retryable: boolean;
}

// Tool permission set for agents
export interface ToolPermissionSet {
  allowedTools: string[];
  deniedTools: string[];
  requiresApproval: string[];
  budgetLimits: Record<string, number>;
}

// Tool preferences for agents
export interface ToolPreferences {
  preferredTools: string[];
  toolSettings: Record<string, any>;
  timeoutOverrides: Record<string, number>;
}

// Tool budget tracking
export interface ToolBudget {
  dailyLimit: number;
  monthlyLimit: number;
  currentDailyUsage: number;
  currentMonthlyUsage: number;
  costPerExecution: Record<string, number>;
}

// Tool usage record for analytics
export interface ToolUsageRecord {
  id: string;
  toolId: string;
  agentId: string;
  executionId: string;
  startTime: Date;
  endTime?: Date;
  status: ToolExecutionStatus;
  cost?: number;
  duration?: number;
  success: boolean;
  errorCode?: string;
  metadata?: Record<string, any>;
}

// Tool definition interface
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  parameters: JSONSchema;
  returnType: JSONSchema;
  examples: ToolExample[];
  securityLevel: SecurityLevel;
  costEstimate?: number;
  executionTimeEstimate?: number;
  requiresApproval: boolean;
  dependencies: string[];
  version: string;
  author: string;
  tags: string[];
  isEnabled: boolean;
  rateLimits?: Record<string, number>;
}

// Tool execution interface
export interface ToolExecution {
  id: string;
  toolId: string;
  agentId: string;
  parameters: Record<string, any>;
  status: ToolExecutionStatus;
  startTime: Date;
  endTime?: Date;
  result?: any;
  error?: ToolExecutionError;
  approvalRequired: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  cost?: number;
  executionTimeMs?: number;
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, any>;
}

export interface ToolCall {
  id: string;
  toolId: string;
  parameters: Record<string, any>;
  reasoning: string; // Why the agent chose this tool
  confidence: number; // 0-1 confidence in tool selection
  alternatives?: Array<{
    toolId: string;
    reason: string;
  }>;
}

export interface ToolResult {
  callId: string;
  executionId: string;
  success: boolean;
  result?: any;
  error?: ToolExecutionError;
  executionTime: number;
  cost?: number;
  metadata?: Record<string, any>;
}

// Enhanced interfaces for integration with existing agent system
export interface ToolCapableMessage {
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  requiresToolApproval?: boolean;
  toolExecutionSummary?: string;
  toolCosts?: number;
}

// Tool Registry interfaces
export interface ToolRegistry {
  register: (tool: ToolDefinition) => Promise<void>;
  unregister: (toolId: string) => Promise<void>;
  get: (toolId: string) => Promise<ToolDefinition | null>;
  getAll: () => Promise<ToolDefinition[]>;
  getByCategory: (category: ToolCategory) => Promise<ToolDefinition[]>;
  search: (query: string) => Promise<ToolDefinition[]>;
  isEnabled: (toolId: string) => Promise<boolean>;
  setEnabled: (toolId: string, enabled: boolean) => Promise<void>;
}

// Tool Execution Engine interfaces
export interface ToolExecutionEngine {
  execute: (toolCall: ToolCall, agentId: string) => Promise<ToolExecution>;
  getExecution: (executionId: string) => Promise<ToolExecution | null>;
  cancelExecution: (executionId: string) => Promise<boolean>;
  getActiveExecutions: (agentId?: number) => Promise<ToolExecution[]>;
  retryExecution: (executionId: string) => Promise<ToolExecution>;
}

// Tool Permission Manager interfaces
export interface ToolPermissionManager {
  canUse: (agentId: string, toolId: string) => Promise<boolean>;
  requiresApproval: (agentId: string, toolId: string) => Promise<boolean>;
  checkBudget: (agentId: string, estimatedCost: number) => Promise<boolean>;
  recordUsage: (agentId: string, usage: ToolUsageRecord) => Promise<void>;
  getUsageHistory: (agentId: string, limit?: number) => Promise<ToolUsageRecord[]>;
}

// Events for tool system observability
export type ToolEvent = 
  | { type: 'tool-registered'; payload: { toolId: string } }
  | { type: 'tool-unregistered'; payload: { toolId: string } }
  | { type: 'execution-started'; payload: { executionId: string; toolId: string; agentId: string } }
  | { type: 'execution-completed'; payload: { executionId: string; success: boolean; duration: number } }
  | { type: 'execution-failed'; payload: { executionId: string; error: ToolExecutionError } }
  | { type: 'approval-requested'; payload: { executionId: string; toolId: string; agentId: string } }
  | { type: 'approval-granted'; payload: { executionId: string; approvedBy: string } }
  | { type: 'budget-exceeded'; payload: { agentId: string; limit: number; attempted: number } }
  | { type: 'rate-limit-hit'; payload: { agentId: string; toolId: string } };

export interface ToolEventHandler {
  (event: ToolEvent): void | Promise<void>;
}

// Configuration for tool system
export interface ToolSystemConfig {
  enableToolUsage: boolean;
  defaultApprovalRequired: boolean;
  globalRateLimits: {
    maxConcurrentExecutions: number;
    maxExecutionsPerMinute: number;
  };
  defaultTimeouts: {
    execution: number;
    approval: number;
  };
  budgetDefaults: {
    dailyLimit: number;
    hourlyLimit: number;
  };
  securitySettings: {
    sandboxEnabled: boolean;
    auditingEnabled: boolean;
    encryptResults: boolean;
  };
} 