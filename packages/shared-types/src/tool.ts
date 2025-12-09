// Tool System Type Definitions for Navratna
// This file defines the comprehensive type system for agent tooling capabilities

export enum ToolCategory {
  API = 'api',
  COMPUTATION = 'computation',
  FILE_SYSTEM = 'file-system',
  DATABASE = 'database',
  WEB_SEARCH = 'web-search',
  CODE_EXECUTION = 'code-execution',
  COMMUNICATION = 'communication',
  KNOWLEDGE_GRAPH = 'knowledge-graph',
  DEPLOYMENT = 'deployment',
  MONITORING = 'monitoring',
  ANALYSIS = 'analysis',
  GENERATION = 'generation',
  SYSTEM = 'system',
  NETWORK = 'network',
  DEVELOPMENT = 'development',
  MCP = 'mcp',
}

export enum ToolExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  APPROVAL_REQUIRED = 'approval-required',
}

// SecurityLevel is imported from security.ts to avoid duplication
import type { SecurityLevel } from './security.js';

// Simple JSON Schema definition (subset of JSON Schema 7)
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  additionalProperties?: boolean;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: any[];
  default?: any;
  description?: string;
}

export interface ToolExample {
  name: string;
  description: string;
  input: Record<string, any>;
  expectedOutput: any;
  notes?: string;
}

export interface ToolExecutionError {
  type: 'validation' | 'execution' | 'timeout' | 'permission' | 'quota' | 'dependency' | 'unknown';
  message: string;
  details?: Record<string, any>;
  recoverable: boolean;
  suggestedAction?: string;
}

export interface ToolPermissionSet {
  allowedTools: string[]; // Tool IDs this agent can use
  deniedTools: string[]; // Explicitly denied tools
  maxCostPerHour?: number;
  maxExecutionsPerHour?: number;
  requireApprovalFor: SecurityLevel[]; // Security levels that require approval
  canApproveTools: boolean; // Can this agent approve tool usage for others
}

export interface ToolPreferences {
  preferredTools: Record<ToolCategory, string[]>; // Preferred tool IDs per category
  fallbackTools: Record<string, string[]>; // Fallback tools if primary fails
  timeoutPreference: number; // Preferred timeout in milliseconds
  costLimit?: number; // Maximum cost willing to spend per operation
}

export interface ToolBudget {
  dailyLimit?: number;
  hourlyLimit?: number;
  currentDailySpent: number;
  currentHourlySpent: number;
  resetTime: Date;
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

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  parameters: JSONSchema;
  returnType: JSONSchema;
  examples: ToolExample[];
  securityLevel: SecurityLevel;
  costEstimate?: number; // Cost in arbitrary units (e.g., API calls, compute time)
  executionTimeEstimate?: number; // Estimated execution time in milliseconds
  requiresApproval: boolean;
  dependencies: string[]; // IDs of other tools this depends on
  version: string;
  author: string;
  tags: string[];
  isEnabled: boolean;
  rateLimits?: {
    maxCallsPerMinute?: number;
    maxCallsPerHour?: number;
    maxConcurrentExecutions?: number;
  };
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
  // Properties expected by agent implementations
  success: boolean;
  data?: any;
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
  getActiveExecutions: (agentId?: string) => Promise<ToolExecution[]>;
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
  | {
      type: 'execution-completed';
      payload: { executionId: string; success: boolean; duration: number };
    }
  | { type: 'execution-failed'; payload: { executionId: string; error: ToolExecutionError } }
  | {
      type: 'approval-requested';
      payload: { executionId: string; toolId: string; agentId: string };
    }
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
