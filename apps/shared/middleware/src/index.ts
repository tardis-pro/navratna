// Authentication middleware exports
export {
  authMiddleware,
  requireAdmin,
  requireOperator,
  optionalAuth,
  attachAuth,
  requireAuth,
  withOptionalAuth,
  withRequiredAuth,
  withAdminGuard,
  withOperatorGuard,
  // Nginx auth flow (when nginx validates JWT and forwards X-User-ID header)
  attachNginxAuth,
  requireNginxAuth,
  withNginxAuth,
  getNginxUser,
  validateJWTConfiguration,
  validateJWTSetup,
  diagnoseJWTSignatureError,
  testJWTToken,
  validateJWTToken,
} from './auth_middleware.js';
export type { UserContext, AuthedContext, OptionalAuthContext } from './auth_middleware.js';

// Request validation middleware exports
export {
  validateRequest,
  withValidation,
  validateID,
  validateUUID,
  validatePagination,
  validateJSON,
  requireContentType,
  validateRequestSize,
  createCustomValidator,
} from './validate_request.js';

// Error handling middleware exports
export { errorHandler, AppError, buildErrorResponse } from './error_handler.js';

// Rate limiting middleware exports
export { rateLimiter, createRateLimiter } from './rate_limiter.js';

// Metrics middleware exports
export {
  metricsMiddleware,
  recordAgentAnalysis,
  recordLLMRequest,
  errorTrackingMiddleware,
  metricsEndpoint,
  recordError,
  recordUnhandledError,
  setupGlobalErrorHandlers,
  recordWorkflowExecution,
  recordWorkflowStep,
  recordMCPCall,
  setWorkflowQueueDepth,
  setCircuitBreakerState,
} from './metrics.js';
export type { ErrorContext } from '@uaip/types';

// Request logging middleware exports
export { requestLogger, defaultRequestLogger } from './request_logger.js';
export type { RequestLoggerOptions } from '@uaip/types';

// CSRF protection middleware exports
export {
  CSRFProtection,
  csrfProtection,
  csrfMiddleware,
  csrfTokenEndpoint,
} from './csrf_protection.js';

// API Key authentication middleware exports
export {
  APIKeyAuthService,
  apiKeyAuth,
  apiKeyMiddleware,
  requireReadPermission,
  requireWritePermission,
  requireExecutePermission,
} from './api_key_auth.js';
export type { APIKey, APIKeyContext } from '@uaip/types';

// Re-export HTTP context types from shared types
export * from './types.js';

// Enhanced Validation Middleware
export { AgentValidationMiddleware } from './agent_validation_middleware.js';
export { AgentTransformationService } from './agent_transformation_service.js';

// Agent middleware exports
export {
  loadAgentContext,
  requireAgentContext,
  requireAgentPermission,
  requireSecurityLevel,
  trackAgentOperation,
  agentRateLimit,
  executeAgentOperation,
  requireAgentCapability,
  requireAgentStatus,
  executeAgentTool,
  agentOperationChain,
} from './agent_middleware.js';
export type { AgentContext, AgentExecution } from './agent_middleware.js';

// JWT validator exports
export { JWTValidator } from './j_w_t_validator.js';

// JWKS (JSON Web Key Set) exports — RS256 asymmetric key signing
export {
  getPrivateKey,
  getPublicJWKS,
  signJWT,
  verifyJWT,
  getKeyId,
  resetKeyPair,
  rotateKeyPair,
} from './jwks.js';

// Token generation exports
export { generateAuthTokens } from './token_generator.js';
export type { TokenPayload } from '@uaip/types';

// Error logger exports
export {
  createErrorLogger,
  ServiceErrorLogger,
  DatabaseConnectionError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  BusinessLogicError,
  ExternalServiceError,
  withErrorTracking,
  withSyncErrorTracking,
} from './error_logger.js';
export type { StructuredErrorLogger } from '@uaip/types';

// Response formatting utilities
export {
  successResponse,
  errorResponse,
  paginatedResponse,
  CommonErrors,
} from './response_formatter.js';
export type { ApiResponse } from './response_formatter.js';

// OpenTelemetry tracing exports
export {
  initTracing,
  shutdownTracing,
  withSpan,
  traceDbQuery,
  traceEventBus,
  traceLLMCall,
  traceExternalCall,
  trace,
  context,
  SpanStatusCode,
} from './tracing.js';
export type { TracingConfig, Span } from './tracing.js';

// Sentry error tracking exports
export {
  initSentry,
  captureException,
  captureMessage,
  setSentryUser,
  sentryErrorPlugin,
  flushSentry,
} from './sentry.js';
export type { SentryConfig } from './sentry.js';

// Tenant middleware — per-request RLS tenant context
export { createTenantMiddlewarePlugin, withTenant } from './tenant_middleware.js';

// Elysia TypeBox schema helpers — re-exported so services don't need a direct elysia dep
export { t } from 'elysia';

// Security headers plugin — sets X-Content-Type-Options, X-Frame-Options, etc. on all responses
export { securityHeadersPlugin } from './security_headers.js';
