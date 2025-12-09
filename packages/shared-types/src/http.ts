/**
 * HTTP Context Types for Elysia Framework
 * Provides framework-agnostic typing for middleware and handlers
 */

import type { SecurityLevel } from './security.js';
import type { AgentRole, AgentStatus } from './agent.js';

// ============================================================================
// Base HTTP Context Types
// ============================================================================

/**
 * HTTP Headers type - flexible key-value pairs
 */
export type HTTPHeaders = Record<string, string | string[] | undefined>;

/**
 * Elysia set object for response manipulation
 */
export interface ElysiaSet {
  status?: number | string;
  headers?: HTTPHeaders;
  redirect?: string;
  cookie?: Record<string, unknown>;
}

/**
 * Base context available in all Elysia handlers
 */
export interface ElysiaBaseContext {
  request: Request;
  body: unknown;
  query: Record<string, string>;
  params: Record<string, string>;
  headers: Record<string, string>;
  set: ElysiaSet;
  path: string;
  store: Record<string, unknown>;
}

// ============================================================================
// User and Authentication Context Types
// ============================================================================

/**
 * Authenticated user context attached by auth middleware
 */
export interface UserContext {
  id: string;
  email: string;
  role: string;
  sessionId?: string;
  permissions?: string[];
  isAdmin?: boolean;
}

/**
 * Context with optional user (after attachAuth)
 */
export interface AuthContext extends ElysiaBaseContext {
  user: UserContext | null;
}

/**
 * Context with required user (after requireAuth)
 */
export interface RequiredAuthContext extends ElysiaBaseContext {
  user: UserContext;
}

// ============================================================================
// Agent Context Types
// ============================================================================

/**
 * Agent context attached by loadAgentContext middleware
 */
export interface AgentContext {
  agentId: string;
  userId: string;
  permissions: string[];
  securityLevel: SecurityLevel;
  role: AgentRole;
  status: AgentStatus;
  metadata?: Record<string, unknown>;
}

/**
 * Agent execution tracking data
 */
export interface AgentExecution {
  startTime: number;
  operations: string[];
  results: Array<{
    operation: string;
    duration: number;
    status: number;
  }>;
}

/**
 * Context with agent information
 */
export interface AgentRequestContext extends ElysiaBaseContext {
  agentContext: AgentContext | null;
  agentValidationError?: {
    error: string;
    details?: unknown;
  };
}

/**
 * Context with agent execution tracking (HTTP request context)
 */
export interface HttpAgentExecutionContext extends AgentRequestContext {
  agentExecution?: AgentExecution;
}

// ============================================================================
// API Key Context Types
// ============================================================================

/**
 * API Key context for service-to-service auth
 */
export interface APIKeyContext {
  id: string;
  serviceName: string;
  permissions: string[];
  scopes: string[];
}

/**
 * Context with API key authentication
 */
export interface APIKeyRequestContext extends ElysiaBaseContext {
  apiKey: APIKeyContext | null;
  apiKeyError?: {
    success: false;
    error: {
      code: string;
      message: string;
    };
  };
}

// ============================================================================
// Validation Context Types
// ============================================================================

/**
 * Metadata about validation transformations
 */
export interface ValidationMeta {
  transformationApplied: boolean;
  originalFormat: string;
  validatedAt: Date;
}

/**
 * Context with validation results
 */
export interface ValidationContext extends ElysiaBaseContext {
  validatedBody?: unknown;
  validatedQuery?: unknown;
  validationMeta?: ValidationMeta;
  validationError?: {
    success: false;
    message: string;
    errors?: Array<{
      field: string;
      message: string;
      code?: string;
    }>;
  };
}

// ============================================================================
// Request Logging Context Types
// ============================================================================

/**
 * Context with request tracking info
 */
export interface RequestLoggingContext extends ElysiaBaseContext {
  requestId: string;
  startTime: number;
}

// ============================================================================
// CSRF Context Types
// ============================================================================

/**
 * Context with CSRF token generation
 */
export interface CSRFContext extends ElysiaBaseContext {
  csrfToken: () => string;
  csrfError?: {
    success: false;
    error: {
      code: string;
      message: string;
    };
  };
}

// ============================================================================
// Chat Ingestion Context Types
// ============================================================================

/**
 * Processed chat file metadata
 */
export interface ProcessedChatFile {
  id: string;
  originalName: string;
  content: string;
  size: number;
  type: 'claude' | 'gpt' | 'whatsapp' | 'generic';
  userId: string;
  detectedPlatform?: string;
  validationResult: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    metadata: {
      encoding?: string;
      lineCount?: number;
      estimatedConversations?: number;
      fileType?: string;
    };
  };
}

/**
 * Chat ingestion job info
 */
export interface ChatIngestionJob {
  jobId: string;
  fileCount: number;
  totalSize: number;
}

/**
 * Chat ingestion options
 */
export interface ChatIngestionOptions {
  extractKnowledge: boolean;
  saveToGraph: boolean;
  generateEmbeddings: boolean;
  batchSize: number;
  concurrency: number;
  userId: string;
}

/**
 * Context for chat file upload handling
 */
export interface ChatUploadContext extends ElysiaBaseContext {
  uploadedFiles?: unknown[];
  uploadError?: {
    error: string;
    message: string;
  };
}

/**
 * Context after chat validation
 */
export interface ChatValidationContext extends ChatUploadContext {
  validatedOptions?: ChatIngestionOptions;
  validationError?: {
    error: string;
    message: string;
    details?: unknown[];
  };
}

/**
 * Context after file format validation
 */
export interface ChatFileContext extends ChatValidationContext {
  chatFiles?: ProcessedChatFile[];
  validationWarnings?: string[];
  formatError?: {
    error: string;
    message: string;
    details?: string[];
  };
}

/**
 * Context after parsing
 */
export interface ChatParseContext extends ChatFileContext {
  parseResults?: Array<{
    fileId: string;
    fileName: string;
    conversationsFound: number;
    success: boolean;
    error?: string;
  }>;
  parseError?: {
    error: string;
    message: string;
    details?: unknown[];
  };
}

/**
 * Context after job creation
 */
export interface ChatIngestionContext extends ChatParseContext {
  chatIngestionJob?: ChatIngestionJob;
  jobError?: {
    error: string;
    message: string;
  };
}

// ============================================================================
// Metrics Context Types
// ============================================================================

/**
 * Context for error tracking
 */
export interface ErrorContext {
  service: string;
  endpoint?: string;
  userId?: string;
  requestId?: string;
  severity?: 'error' | 'critical' | 'warning';
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Combined Context Types (for multi-middleware chains)
// ============================================================================

/**
 * Full authenticated context with all middleware applied
 */
export interface FullAuthenticatedContext extends ElysiaBaseContext {
  user: UserContext;
  requestId: string;
  startTime: number;
  validationMeta?: ValidationMeta;
}

/**
 * Full agent operation context
 */
export interface FullAgentContext extends ElysiaBaseContext {
  user: UserContext;
  agentContext: AgentContext;
  agentExecution?: AgentExecution;
  requestId: string;
  startTime: number;
}

// ============================================================================
// Handler Type Helpers
// ============================================================================

/**
 * Generic handler result type
 */
export type HandlerResult<T> = T | Promise<T> | void | Promise<void>;

/**
 * Guard beforeHandle signature
 */
export type GuardHandler<TContext = ElysiaBaseContext> = (
  context: TContext
) => HandlerResult<unknown>;

/**
 * Derive handler signature
 */
export type DeriveHandler<TContext = ElysiaBaseContext, TResult = Record<string, unknown>> = (
  context: TContext
) => TResult | Promise<TResult>;

/**
 * Route handler signature
 */
export type RouteHandler<TContext = ElysiaBaseContext, TResult = unknown> = (
  context: TContext
) => HandlerResult<TResult>;
