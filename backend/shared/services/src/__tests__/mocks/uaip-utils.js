// Jest is globally available

module.exports = {
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  logError: jest.fn(),
  logSecurityEvent: jest.fn(),
  logAudit: jest.fn(),
  logMetric: jest.fn(),
  logRequest: jest.fn(),
  logPerformance: jest.fn(),
  createLoggerStream: jest.fn(),
  createLogContext: jest.fn(),
  logWithContext: jest.fn(),
  
  ApiError: class ApiError extends Error {
    constructor(message, statusCode = 500) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
    }
  },
  ValidationError: class ValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ValidationError';
    }
  },
  DatabaseError: class DatabaseError extends Error {
    constructor(message) {
      super(message);
      this.name = 'DatabaseError';
    }
  },
  AuthenticationError: class AuthenticationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AuthenticationError';
    }
  },
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AuthorizationError';
    }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(message) {
      super(message);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class ConflictError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ConflictError';
    }
  },
  RateLimitError: class RateLimitError extends Error {
    constructor(message) {
      super(message);
      this.name = 'RateLimitError';
    }
  },
  InternalServerError: class InternalServerError extends Error {
    constructor(message) {
      super(message);
      this.name = 'InternalServerError';
    }
  },
  ExternalServiceError: class ExternalServiceError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ExternalServiceError';
    }
  },
  SecurityError: class SecurityError extends Error {
    constructor(message) {
      super(message);
      this.name = 'SecurityError';
    }
  },
  
  WidgetRegistry: class WidgetRegistry {
    constructor() {}
    register = jest.fn();
    unregister = jest.fn();
    get = jest.fn();
    list = jest.fn();
  },
  globalWidgetRegistry: {
    register: jest.fn(),
    unregister: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
  }
};