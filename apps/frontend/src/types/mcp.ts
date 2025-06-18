// MCP (Model Context Protocol) Server Integration Types
// Defines types for managing and communicating with MCP servers

export type MCPServerType = 'npx' | 'uvx' | 'node' | 'python';

export interface MCPServerConfig {
  id: string;
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
  healthCheckInterval: number; // milliseconds
  timeout: number; // milliseconds
  tags: string[];
  author: string;
  version: string;
  requiresApproval: boolean;
  securityLevel: 'safe' | 'moderate' | 'restricted' | 'dangerous';
}

export interface MCPServerInstance {
  id: string;
  config: MCPServerConfig;
  status: 'stopped' | 'starting' | 'running' | 'error' | 'stopping';
  pid?: number;
  startTime?: Date;
  lastHealthCheck?: Date;
  error?: string;
  stats: MCPServerStats;
}

export interface MCPServerStats {
  uptime: number;
  requestCount: number;
  successCount: number;
  errorCount: number;
  averageResponseTime: number;
  lastError?: string;
  lastErrorTime?: Date;
}

// MCP Protocol Types (simplified)
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema
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
  arguments?: any[];
}

export interface MCPServerCapabilities {
  tools?: MCPTool[];
  resources?: MCPResource[];
  prompts?: MCPPrompt[];
  supportsStreaming?: boolean;
  supportsProgress?: boolean;
}

export interface MCPRequest {
  id: string;
  method: string;
  params?: any;
}

export interface MCPResponse {
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// Events
export type MCPServerEvent = 
  | { type: 'server-started'; payload: { serverId: string; pid: number } }
  | { type: 'server-stopped'; payload: { serverId: string; reason: string } }
  | { type: 'server-error'; payload: { serverId: string; error: string } }
  | { type: 'tool-called'; payload: { serverId: string; tool: string; duration: number } }
  | { type: 'capabilities-updated'; payload: { serverId: string; capabilities: MCPServerCapabilities } };

export interface MCPServerEventHandler {
  (event: MCPServerEvent): void | Promise<void>;
}

// Configuration presets for popular MCP servers
export interface MCPServerPreset {
  id: string;
  name: string;
  description: string;
  config: Omit<MCPServerConfig, 'id' | 'enabled'>;
  setupInstructions?: string;
  requiredEnvVars?: string[];
  documentation?: string;
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

export interface MCPServerRegistry {
  register: (config: MCPServerConfig) => Promise<void>;
  unregister: (serverId: string) => Promise<void>;
  get: (serverId: string) => Promise<MCPServerConfig | null>;
  getAll: () => Promise<MCPServerConfig[]>;
  getPresets: () => Promise<MCPServerPreset[]>;
  createFromPreset: (presetId: string, customizations?: Partial<MCPServerConfig>) => Promise<MCPServerConfig>;
} 