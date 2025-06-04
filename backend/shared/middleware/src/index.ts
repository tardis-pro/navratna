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
  metricsEndpoint 
} from './metrics.js';

// Request logging middleware exports
export { requestLogger, defaultRequestLogger } from './requestLogger.js';

// Type extensions
export {} from './types'; 