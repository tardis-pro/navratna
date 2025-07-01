import { jest } from '@jest/globals';
import { SecurityLevel, RiskLevel, User } from '@uaip/types';

// Mock DatabaseService
export const createMockDatabaseService = () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  healthCheck: jest.fn().mockResolvedValue({
    status: 'healthy',
    details: {
      connected: true,
      totalConnections: 1,
      idleConnections: 0,
      waitingConnections: 0,
      responseTime: 5
    }
  }),
  close: jest.fn().mockResolvedValue(undefined),
  
  // User operations
  createUser: jest.fn().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }),
  getUserById: jest.fn().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    isActive: true
  }),
  getUserByUsername: jest.fn().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    passwordHash: '$2b$08$test.hash.here',
    isActive: true
  }),
  getUserByEmail: jest.fn().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    isActive: true
  }),
  updateUser: jest.fn().mockResolvedValue({
    id: 'user-123',
    username: 'updateduser',
    email: 'updated@example.com',
    role: 'user',
    isActive: true
  }),
  deleteUser: jest.fn().mockResolvedValue(true),
  findUsers: jest.fn().mockResolvedValue([
    {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      isActive: true
    }
  ]),

  // Audit operations
  createAuditLog: jest.fn().mockResolvedValue({
    id: 'audit-123',
    userId: 'user-123',
    action: 'LOGIN',
    resource: 'auth',
    details: {},
    timestamp: new Date(),
    ipAddress: '127.0.0.1'
  }),
  getAuditLogs: jest.fn().mockResolvedValue([
    {
      id: 'audit-123',
      userId: 'user-123',
      action: 'LOGIN',
      resource: 'auth',
      timestamp: new Date()
    }
  ]),

  // Approval workflow operations
  createApprovalRequest: jest.fn().mockResolvedValue({
    id: 'approval-123',
    requesterId: 'user-123',
    operation: 'HIGH_RISK_OPERATION',
    status: 'pending',
    createdAt: new Date()
  }),
  getApprovalRequest: jest.fn().mockResolvedValue({
    id: 'approval-123',
    requesterId: 'user-123',
    operation: 'HIGH_RISK_OPERATION',
    status: 'pending'
  }),
  updateApprovalRequest: jest.fn().mockResolvedValue({
    id: 'approval-123',
    status: 'approved',
    approvedBy: 'admin-123',
    approvedAt: new Date()
  }),
  getPendingApprovals: jest.fn().mockResolvedValue([
    {
      id: 'approval-123',
      operation: 'HIGH_RISK_OPERATION',
      status: 'pending',
      createdAt: new Date()
    }
  ])
});

// Mock EventBusService
export const createMockEventBusService = () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue(undefined),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
});

// Mock RedisService
export const createMockRedisService = () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
});

// Mock SecurityValidationService
export const createMockSecurityValidationService = () => ({
  validateOperation: jest.fn().mockResolvedValue({
    allowed: true,
    riskLevel: SecurityLevel.MEDIUM,
    approvalRequired: false,
    conditions: [],
    reasoning: 'Operation approved'
  }),
  assessRisk: jest.fn().mockResolvedValue({
    level: SecurityLevel.MEDIUM,
    overallRisk: RiskLevel.LOW,
    score: 25,
    factors: [],
    recommendations: [],
    mitigations: [],
    assessedAt: new Date(),
    assessedBy: 'system'
  }),
  filterSensitiveData: jest.fn().mockImplementation((data) => data),
  createApprovalWorkflow: jest.fn().mockResolvedValue('workflow-123')
});

// Mock NotificationService
export const createMockNotificationService = () => ({
  sendEmail: jest.fn().mockResolvedValue({
    messageId: 'msg-123',
    status: 'sent'
  }),
  sendApprovalNotification: jest.fn().mockResolvedValue(true),
  sendSecurityAlert: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true)
});

// Mock AuditService
export const createMockAuditService = () => ({
  logAction: jest.fn().mockResolvedValue({
    id: 'audit-123',
    userId: 'user-123',
    action: 'LOGIN',
    resource: 'auth',
    details: {},
    timestamp: new Date()
  }),
  logEvent: jest.fn().mockResolvedValue({
    id: 'audit-123',
    eventType: 'PERMISSION_GRANTED',
    userId: 'user-123',
    details: {},
    timestamp: new Date()
  }),
  logSecurityEvent: jest.fn().mockResolvedValue({
    id: 'security-123',
    eventType: 'FAILED_LOGIN',
    userId: 'user-123',
    details: {},
    timestamp: new Date()
  }),
  queryEvents: jest.fn().mockResolvedValue([]),
  getAuditTrail: jest.fn().mockResolvedValue([
    {
      id: 'audit-123',
      action: 'LOGIN',
      timestamp: new Date()
    }
  ]),
  searchAuditLogs: jest.fn().mockResolvedValue([])
});

// Mock ApprovalWorkflowService
export const createMockApprovalWorkflowService = () => ({
  createApprovalRequest: jest.fn().mockResolvedValue({
    id: 'approval-123',
    requesterId: 'user-123',
    operation: 'HIGH_RISK_OPERATION',
    status: 'pending',
    createdAt: new Date()
  }),
  createApprovalWorkflow: jest.fn().mockResolvedValue({
    id: 'workflow-123',
    operationId: 'operation-123',
    status: 'pending',
    createdAt: new Date()
  }),
  processApproval: jest.fn().mockResolvedValue({
    id: 'approval-123',
    status: 'approved',
    approvedBy: 'admin-123'
  }),
  rejectApproval: jest.fn().mockResolvedValue({
    id: 'approval-123',
    status: 'rejected',
    rejectedBy: 'admin-123',
    reason: 'Security concerns'
  }),
  getPendingApprovals: jest.fn().mockResolvedValue([
    {
      id: 'approval-123',
      operation: 'HIGH_RISK_OPERATION',
      status: 'pending'
    }
  ]),
  getApprovalHistory: jest.fn().mockResolvedValue([
    {
      id: 'approval-123',
      status: 'approved',
      processedAt: new Date()
    }
  ])
});

// Mock LLMProviderManagementService
export const createMockLLMProviderManagementService = () => ({
  createProvider: jest.fn().mockResolvedValue({
    id: 'provider-123',
    name: 'OpenAI',
    type: 'openai',
    isActive: true,
    createdAt: new Date()
  }),
  getProvider: jest.fn().mockResolvedValue({
    id: 'provider-123',
    name: 'OpenAI',
    type: 'openai',
    isActive: true
  }),
  updateProvider: jest.fn().mockResolvedValue({
    id: 'provider-123',
    name: 'OpenAI Updated',
    isActive: true
  }),
  deleteProvider: jest.fn().mockResolvedValue(true),
  listProviders: jest.fn().mockResolvedValue([
    {
      id: 'provider-123',
      name: 'OpenAI',
      type: 'openai',
      isActive: true
    }
  ]),
  testProviderConnection: jest.fn().mockResolvedValue({
    success: true,
    latency: 150,
    timestamp: new Date()
  })
});

// Utility to create a complete mock user
export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  role: 'user',
  isActive: true,
  createdAt: new Date('2023-01-01'),
  updatedAt: new Date('2023-01-01'),
  lastLoginAt: new Date('2023-01-01'),
  ...overrides
});

// Mock bcrypt for password hashing
export const createMockBcrypt = () => ({
  hash: jest.fn().mockResolvedValue('$2b$08$test.hash.here'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('$2b$08$test.salt.here')
});

// Mock jsonwebtoken
export const createMockJWT = () => ({
  sign: jest.fn().mockReturnValue('test.jwt.token'),
  verify: jest.fn().mockReturnValue({
    userId: 'user-123',
    username: 'testuser',
    role: 'user'
  }),
  decode: jest.fn().mockReturnValue({
    userId: 'user-123',
    username: 'testuser',
    role: 'user'
  })
});