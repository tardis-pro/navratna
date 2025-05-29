// Authentication middleware
export { authMiddleware } from './authMiddleware.js';

// Validation middleware
export { 
  validateRequest, 
  validateUUID, 
  validateJSON, 
  validatePagination,
  requireContentType,
  validateRequestSize,
  createCustomValidator
} from './validateRequest.js';

// Error handling middleware
export { errorHandler } from './errorHandler.js';

// Metrics middleware
export { metricsMiddleware } from './metrics.js';

// Rate limiting middleware
export { rateLimiter } from './rateLimiter.js';

// Type extensions
export {} from './src/types.js'; 