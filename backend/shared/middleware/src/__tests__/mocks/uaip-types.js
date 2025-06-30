module.exports = {
  SecurityLevel: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
  },
  AgentRole: {
    SPECIALIST: 'SPECIALIST',
    ORCHESTRATOR: 'ORCHESTRATOR',
    COORDINATOR: 'COORDINATOR'
  },
  AgentStatus: {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    MAINTENANCE: 'MAINTENANCE'
  },
  ValidationSchema: {
    Agent: jest.fn(),
    Operation: jest.fn(),
    User: jest.fn()
  },
  HttpStatus: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500
  },
  AgentCreateRequestSchema: {
    parse: jest.fn((data) => data)
  },
  AgentUpdateSchema: {
    parse: jest.fn((data) => data)
  }
};