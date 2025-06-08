// Authentication middleware exports
export { 
  authMiddleware, 
  requireAdmin, 
  requireOperator, 
  optionalAuth,
  validateJWTConfiguration,
  validateJWTSetup,
  diagnoseJWTSignatureError,
  testJWTToken
} from './authMiddleware.js';

// Request validation middleware exports  
export { 
  validateRequest,
  validateID,
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
  metricsEndpoint 
} from './metrics.js';

// Request logging middleware exports
export { requestLogger, defaultRequestLogger } from './requestLogger.js';

// Type extensions
export {} from './types';

// Enhanced Validation Middleware for TypeORM Migration
export { AgentValidationMiddleware } from './agentValidationMiddleware.js'; 
export { AgentTransformationService } from './agentTransformationService.js';

// Security middleware
export {
  securityHeaders,
  corsMiddleware
} from './security.js';

// Logging middleware
export {
  errorLogger,
  auditLogger
} from './logging.js';

// Authentication middleware
export {
  authenticateToken,
  requireAuth,
  requireRole,
  requirePermission
} from './auth.js';

// Error handling middleware
export {
  notFoundHandler,
  validationErrorHandler
} from './errorHandler.js';