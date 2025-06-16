// MCP (Model Context Protocol) Integration Types for Council of Nycea
// This file defines the comprehensive type system for MCP server management and integration

export enum MCPServerType {
  FILESYSTEM = 'filesystem',
  DATABASE = 'database', 
  API = 'api',
  WEB_SEARCH = 'web-search',
  CODE_EXECUTION = 'code-execution',
  KNOWLEDGE_GRAPH = 'knowledge-graph',
  MONITORING = 'monitoring',
  TOOL = 'tool',
  KNOWLEDGE = 'knowledge',
  CUSTOM = 'custom'
}

export enum MCPServerStatus {
  STOPPED = 'stopped',
  STARTING = 'starting', 
  RUNNING = 'running',
  ERROR = 'error',
  STOPPING = 'stopping',
  MAINTENANCE = 'maintenance'
}

export interface MCPServerConfig {
  name: string;
  description: string;
  type: MCPServerType;
  command: string;
  args: string[];
  env?: Record<string, string>;
  workingDirectory?: string;
  enabled: boolean;
  autoStart: boolean;
  retryAttempts: number;
  healthCheckInterval: number;
  timeout: number;
  tags: string[];
  author: string;
  version: string;
  requiresApproval: boolean;
  securityLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface MCPServerInstance {
  Id: number;
  config: MCPServerConfig;
  status: MCPServerStatus;
  pid?: number;
  startTime?: Date;
  lastHealthCheck?: Date;
  error?: string;
  stats: MCPServerStats;
}

export interface MCPServerStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
  lastCallTime?: Date;
  uptime: number;
  memoryUsage?: number;
  cpuUsage?: number;
  requestCount?: number;
  errorCount?: number;
  lastRequestAt?: Date;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema?: any;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: any;
}

export interface MCPServerCapabilities {
  tools?: MCPTool[];
  resources?: MCPResource[];
  prompts?: MCPPrompt[];
  supportsStreaming?: boolean;
  supportsProgress?: boolean;
  logging?: boolean;
  sampling?: boolean;
}

export interface MCPToolCall {
  Id: number;
  serverId: number;
  toolName: string;
  parameters: Record<string, any>;
  timestamp: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  duration?: number;
  executionTime?: number;
  calledAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

export interface MCPToolResult {
  success: boolean;
  result?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: Record<string, any>;
}

// Events
export type MCPServerEvent = 
  | { type: 'server-started'; payload: { serverId: number; pid: number } }
  | { type: 'server-stopped'; payload: { serverId: number; reason: string } }
  | { type: 'server-error'; payload: { serverId: number; error: string } }
  | { type: 'tool-called'; payload: { serverId: number; tool: string; duration: number } }
  | { type: 'capabilities-updated'; payload: { serverId: number; capabilities: MCPServerCapabilities } };

export type MCPServerEventHandler = (event: MCPServerEvent) => void;

export interface MCPServerEventPayload {
  serverId: number;
  [key: string]: any;
}

// Manager interfaces
export interface MCPServerManager {
  start: (serverId: string) => Promise<void>;
  stop: (serverId: string) => Promise<void>;
  restart: (serverId: string) => Promise<void>;
  getStatus: (serverId: string) => Promise<MCPServerInstance | null>;
  getAllServers: () => Promise<MCPServerInstance[]>;
  getCapabilities: (serverId: string) => Promise<MCPServerCapabilities | null>;
  callTool: (serverId: string, toolCall: MCPToolCall) => Promise<MCPToolResult>;
  addEventListener: (handler: MCPServerEventHandler) => void;
  removeEventListener: (handler: MCPServerEventHandler) => void;
}

// Configuration presets for popular MCP servers
export interface MCPServerPreset {
  Id: number;
  name: string;
  description: string;
  config: Omit<MCPServerConfig, 'id' | 'enabled'>;
  setupInstructions?: string;
  requiredEnvVars?: string[];
  documentation?: string;
}

export interface MCPServerRegistry {
  register: (config: MCPServerConfig) => Promise<void>;
  unregister: (serverId: string) => Promise<void>;
  get: (serverId: string) => Promise<MCPServerConfig | null>;
  getAll: () => Promise<MCPServerConfig[]>;
  getPresets: () => Promise<MCPServerPreset[]>;
  createFromPreset: (presetId: string, customizations?: Partial<MCPServerConfig>) => Promise<MCPServerConfig>;
}

// Unified MCP Server interface
export interface MCPServer {
  Id: number;
  name: string;
  type: MCPServerType;
  status: MCPServerStatus;
  url: string;
  version: string;
  capabilities: MCPServerCapabilities;
  stats: MCPServerStats;
  config: MCPServerConfig;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastHealthCheck?: Date;
  metadata?: Record<string, any>;
}

export interface MCPRequest {
  Id: number;
  method: string;
  params?: Record<string, any>;
  timestamp: Date;
}

export interface MCPResponse {
  Id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  timestamp: Date;
}

export interface MCPConnection {
  serverId: number;
  connectionId: number;
  isConnected: boolean;
  connectedAt?: Date;
  lastActivity?: Date;
  errorCount: number;
  metadata?: Record<string, any>;
} 