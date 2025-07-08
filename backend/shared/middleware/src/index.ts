// Authentication middleware exports
export {
  authMiddleware,
  requireAdmin,
  requireOperator,
  optionalAuth,
  validateJWTConfiguration,
  validateJWTSetup,
  diagnoseJWTSignatureError,
  testJWTToken,
  validateJWTToken
} from './authMiddleware.js';

// Request validation middleware exports  
export {
  validateRequest,
  validateID,
  validateUUID,
  validatePagination,
  validateJSON,
  requireContentType,
  validateRequestSize,
  createCustomValidator
} from './validateRequest.js';

// Error handling middleware exports
export { errorHandler, AppError } from './errorHandler.js';

// Rate limiting middleware exports
export { rateLimiter, createRateLimiter } from './rateLimiter.js';

// Metrics middleware exports
export {
  metricsMiddleware,
  recordAgentAnalysis,
  errorTrackingMiddleware,
  metricsEndpoint
} from './metrics.js';

// Request logging middleware exports
export { requestLogger, defaultRequestLogger } from './requestLogger.js';

// CSRF protection middleware exports
export {
  CSRFProtection,
  csrfProtection,
  csrfMiddleware,
  csrfTokenEndpoint
} from './csrfProtection.js';

// API Key authentication middleware exports
export {
  APIKeyAuthService,
  apiKeyAuth,
  apiKeyMiddleware,
  requireReadPermission,
  requireWritePermission,
  requireExecutePermission
} from './apiKeyAuth.js';
export type { APIKeyRequest, APIKey } from './apiKeyAuth.js';

// Type extensions
export { } from './types';

// Enhanced Validation Middleware for TypeORM Migration
export { AgentValidationMiddleware } from './agentValidationMiddleware.js';
export { AgentTransformationService } from './agentTransformationService.js';

// Agent middleware exports
export {
  loadAgentContext,
  requireAgentPermission,
  requireSecurityLevel,
  trackAgentOperation,
  agentRateLimit,
  executeAgentOperation,
  requireAgentCapability,
  requireAgentStatus,
  executeAgentTool,
  agentOperationChain
} from './agentMiddleware.js';
export type { AgentContext } from './agentMiddleware.js';

// JWT middleware exports
export {
  JWTValidator,
  createJWTMiddleware,
  requireRole,
  requirePermissions,
  refreshTokenMiddleware
} from './jwtMiddleware.js';
export type { JWTPayload, JWTConfig } from './jwtMiddleware.js';

export {
  createErrorLogger,
} from './errorLogger.js'
