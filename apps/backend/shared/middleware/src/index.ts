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
  validateJWTConfiguration,
  validateJWTSetup,
  diagnoseJWTSignatureError,
  testJWTToken,
  validateJWTToken,
} from './authMiddleware.js';
export type { UserContext, AuthedContext, OptionalAuthContext } from './authMiddleware.js';

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
} from './validateRequest.js';

// Error handling middleware exports
export { errorHandler, AppError, buildErrorResponse } from './errorHandler.js';

// Rate limiting middleware exports
export { rateLimiter, createRateLimiter } from './rateLimiter.js';

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
} from './metrics.js';
export type { ErrorContext } from './metrics.js';

// Request logging middleware exports
export { requestLogger, defaultRequestLogger } from './requestLogger.js';
export type { RequestLoggerOptions } from './requestLogger.js';

// CSRF protection middleware exports
export {
  CSRFProtection,
  csrfProtection,
  csrfMiddleware,
  csrfTokenEndpoint,
} from './csrfProtection.js';

// API Key authentication middleware exports
export {
  APIKeyAuthService,
  apiKeyAuth,
  apiKeyMiddleware,
  requireReadPermission,
  requireWritePermission,
  requireExecutePermission,
} from './apiKeyAuth.js';
export type { APIKey, APIKeyContext } from './apiKeyAuth.js';

// Re-export HTTP context types from shared types
export * from './types.js';

// Enhanced Validation Middleware
export { AgentValidationMiddleware } from './agentValidationMiddleware.js';
export { AgentTransformationService } from './agentTransformationService.js';

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
} from './agentMiddleware.js';
export type { AgentContext, AgentExecution } from './agentMiddleware.js';

// JWT validator exports
export { JWTValidator } from './JWTValidator.js';

// Token generation exports
export { generateAuthTokens } from './tokenGenerator.js';
export type { TokenPayload } from './tokenGenerator.js';

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
} from './errorLogger.js';
export type { StructuredErrorLogger } from './errorLogger.js';

// Response formatting utilities
export {
  successResponse,
  errorResponse,
  paginatedResponse,
  CommonErrors,
} from './responseFormatter.js';
export type { ApiResponse } from './responseFormatter.js';

// Elysia TypeBox schema helpers — re-exported so services don't need a direct elysia dep
export { t } from 'elysia';
