// Simple object-based mock that will work reliably
const MockApiError = function(statusCode, message, code, details) {
  const error = {
    name: 'ApiError',
    message: message || 'An error occurred',
    statusCode: statusCode || 500,
    code: code || 'UNKNOWN_ERROR',
    details: details
  };
  
  // Make it look like an Error for instanceof checks
  Object.setPrototypeOf(error, Error.prototype);
  
  return error;
};

module.exports = {
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn()
  },
  createId: jest.fn(() => 'test-id-123'),
  hashPassword: jest.fn(() => Promise.resolve('hashed-password')),
  comparePassword: jest.fn(() => Promise.resolve(true)),
  formatError: jest.fn((error) => ({ message: error.message, stack: error.stack })),
  delay: jest.fn(() => Promise.resolve()),
  ApiError: MockApiError,
  logError: jest.fn()
};