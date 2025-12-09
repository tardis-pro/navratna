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
  validateJWTConfiguration,
  validateJWTSetup,
  diagnoseJWTSignatureError,
  testJWTToken,
  validateJWTToken,
} from './authMiddleware.js';
export type { UserContext } from './authMiddleware.js';

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

// Enhanced Validation Middleware for TypeORM Migration
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

// JWT middleware exports
export {
  JWTValidator,
  createJWTMiddleware,
  requireRole,
  requirePermissions,
  refreshTokenMiddleware,
} from './jwtMiddleware.js';
export type { JWTPayload, JWTConfig } from './jwtMiddleware.js';

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
