/**
 * Shared Tool Types
 * Extracted from enterprise-tool-registry to break circular dependencies
 * with adapter modules.
 */

/**
 * Represents a tool that can be registered and executed by the tool registry.
 */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: 'project_management' | 'documentation' | 'communication' | 'development' | 'analytics';
  vendor: string;
  version: string;
  operations: ToolOperation[];
  authentication: ToolAuthentication;
  rateLimit?: RateLimitConfig;
  sandboxing: SandboxConfig;
  compliance: ComplianceConfig;
}

/**
 * Represents a single operation that a tool can perform.
 */
export interface ToolOperation {
  id: string;
  name: string;
  description: string;
  requiredPermissions: string[];
  inputSchema: unknown; // JSON Schema
  outputSchema: unknown; // JSON Schema
  securityLevel: number;
  auditLevel: 'comprehensive' | 'standard' | 'minimal';
}

/**
 * Authentication configuration for a tool.
 */
export interface ToolAuthentication {
  type: 'oauth2' | 'api_key' | 'basic' | 'jwt' | 'saml';
  config: unknown;
  scopes?: string[];
  tokenEndpoint?: string;
  refreshable?: boolean;
}

/**
 * Rate limiting configuration for a tool.
 */
export interface RateLimitConfig {
  requests: number;
  window: number; // milliseconds
  burstAllowance?: number;
  perUser?: boolean;
}

/**
 * Sandboxing configuration for safe tool execution.
 */
export interface SandboxConfig {
  enabled: boolean;
  executionTimeout: number; // milliseconds
  memoryLimit: number; // MB
  networkAccess: 'none' | 'restricted' | 'full';
  allowedDomains?: string[];
}

/**
 * Compliance and data governance configuration.
 */
export interface ComplianceConfig {
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  piiHandling: boolean;
  encryptionRequired: boolean;
  auditRetention: number; // days
  gdprCompliant: boolean;
  hipaaCompliant: boolean;
}

/**
 * Base interface for tool adapters.
 * Adapters implement this interface to integrate with the tool registry.
 */
export interface ToolAdapter {
  execute(operationId: string, parameters: unknown): Promise<unknown>;
  setTokens(accessToken: string, refreshToken?: string, expiresAt?: string): void;
}
