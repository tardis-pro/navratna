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
  createUser: jest.fn<any, any>().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }),
  getUserById: jest.fn<any, any>().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    isActive: true
  }),
  getUserByUsername: jest.fn<any, any>().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    passwordHash: '$2b$08$test.hash.here',
    isActive: true
  }),
  getUserByEmail: jest.fn<any, any>().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    isActive: true
  }),
  updateUser: jest.fn<any, any>().mockResolvedValue({
    id: 'user-123',
    username: 'updateduser',
    email: 'updated@example.com',
    role: 'user',
    isActive: true
  }),
  deleteUser: jest.fn<any, any>().mockResolvedValue(true),
  findUsers: jest.fn<any, any>().mockResolvedValue([
    {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      isActive: true
    }
  ]),

  // Audit operations
  createAuditLog: jest.fn<any, any>().mockResolvedValue({
    id: 'audit-123',
    userId: 'user-123',
    action: 'LOGIN',
    resource: 'auth',
    details: {},
    timestamp: new Date(),
    ipAddress: '127.0.0.1'
  }),
  getAuditLogs: jest.fn<any, any>().mockResolvedValue([
    {
      id: 'audit-123',
      userId: 'user-123',
      action: 'LOGIN',
      resource: 'auth',
      timestamp: new Date()
    }
  ]),

  // Approval workflow operations
  createApprovalRequest: jest.fn<any, any>().mockResolvedValue({
    id: 'approval-123',
    requesterId: 'user-123',
    operation: 'HIGH_RISK_OPERATION',
    status: 'pending',
    createdAt: new Date()
  }),
  getApprovalRequest: jest.fn<any, any>().mockResolvedValue({
    id: 'approval-123',
    requesterId: 'user-123',
    operation: 'HIGH_RISK_OPERATION',
    status: 'pending'
  }),
  updateApprovalRequest: jest.fn<any, any>().mockResolvedValue({
    id: 'approval-123',
    status: 'approved',
    approvedBy: 'admin-123',
    approvedAt: new Date()
  }),
  getPendingApprovals: jest.fn<any, any>().mockResolvedValue([
    {
      id: 'approval-123',
      operation: 'HIGH_RISK_OPERATION',
      status: 'pending',
      createdAt: new Date()
    }
  ]),

  // Authentication operations
  createRefreshToken: jest.fn<any, any>().mockResolvedValue({
    id: 'refresh-123',
    token: 'refresh.token.here',
    userId: 'user-123',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date()
  }),
  resetUserLoginAttempts: jest.fn<any, any>().mockResolvedValue(true),
  updateUserLoginTracking: jest.fn<any, any>().mockResolvedValue(true),
  getRefreshTokenWithUser: jest.fn<any, any>().mockResolvedValue({
    id: 'refresh-123',
    token: 'refresh.token.here',
    userId: 'user-123',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    user: {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      isActive: true
    }
  }),
  revokeRefreshToken: jest.fn<any, any>().mockResolvedValue(true),
  updateUserPassword: jest.fn<any, any>().mockResolvedValue(true),
  revokeAllUserRefreshTokens: jest.fn<any, any>().mockResolvedValue(true),
  createPasswordResetToken: jest.fn<any, any>().mockResolvedValue({
    id: 'reset-123',
    token: 'reset.token.here',
    userId: 'user-123',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date()
  }),
  getPasswordResetTokenWithUser: jest.fn<any, any>().mockResolvedValue({
    id: 'reset-123',
    token: 'reset.token.here',
    userId: 'user-123',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    user: {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      isActive: true
    }
  }),
  markPasswordResetTokenAsUsed: jest.fn<any, any>().mockResolvedValue(true),
  getUserHighestRole: jest.fn<any, any>().mockResolvedValue('user'),

  // Agent usage tracking
  getAgentHourlyUsage: jest.fn<any, any>().mockResolvedValue(5),
  getAgentDailyUsage: jest.fn<any, any>().mockResolvedValue(50),

  // OAuth provider operations
  createOAuthProvider: jest.fn<any, any>().mockResolvedValue({
    id: 'provider-123',
    type: 'github',
    isEnabled: true
  }),
  getOAuthState: jest.fn<any, any>().mockResolvedValue({
    state: 'state-123',
    providerId: 'provider-123',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  }),
  getAgentOAuthConnection: jest.fn<any, any>().mockResolvedValue({
    id: 'connection-123',
    agentId: 'agent-123',
    providerId: 'provider-123',
    isActive: true
  }),
  updateAgentOAuthConnection: jest.fn<any, any>().mockResolvedValue(true),
  getUserByOAuthProvider: jest.fn<any, any>().mockResolvedValue(null)
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
  logEvent: jest.fn<any, any>().mockResolvedValue({
    id: 'audit-123',
    timestamp: new Date(),
    eventType: 'SECURITY_EVENT',
    severity: 'INFO',
    message: 'Test audit event'
  }),
  logSecurityEvent: jest.fn<any, any>().mockResolvedValue({
    id: 'security-audit-123',
    timestamp: new Date(),
    eventType: 'SECURITY_EVENT',
    severity: 'WARNING'
  }),
  logUserAction: jest.fn<any, any>().mockResolvedValue({
    id: 'user-action-123',
    timestamp: new Date(),
    eventType: 'USER_ACTION',
    severity: 'INFO'
  }),
  logSystemEvent: jest.fn<any, any>().mockResolvedValue({
    id: 'system-event-123',
    timestamp: new Date(),
    eventType: 'SYSTEM_EVENT',
    severity: 'INFO'
  }),
  queryEvents: jest.fn<any, any>().mockResolvedValue([
    {
      id: 'audit-123',
      timestamp: new Date(),
      eventType: 'SECURITY_EVENT',
      severity: 'INFO',
      message: 'Test audit event'
    }
  ]),
  getEventsByUser: jest.fn<any, any>().mockResolvedValue([]),
  getEventsByType: jest.fn<any, any>().mockResolvedValue([]),
  getEventsInTimeRange: jest.fn<any, any>().mockResolvedValue([]),
  searchEvents: jest.fn<any, any>().mockResolvedValue([])
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
  name: 'Test User',
  email: 'test@example.com',
  role: 'user',
  isActive: true,
  createdAt: new Date('2023-01-01'),
  updatedAt: new Date('2023-01-01'),
  lastLoginAt: new Date('2023-01-01'),
  securityClearance: SecurityLevel.MEDIUM,
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

// Mock OAuthProviderService
export const createMockOAuthProviderService = () => ({
  validateAgentOperation: jest.fn().mockResolvedValue({
    allowed: true,
    reason: 'Valid operation'
  }),
  createProvider: jest.fn().mockResolvedValue({
    id: 'provider-123',
    type: 'github',
    isEnabled: true
  }),
  getProvider: jest.fn().mockResolvedValue({
    id: 'provider-123',
    type: 'github',
    isEnabled: true
  }),
  generateAuthorizationUrl: jest.fn().mockResolvedValue({
    url: 'https://github.com/login/oauth/authorize',
    state: 'state-123',
    codeVerifier: 'verifier-123'
  }),
  handleCallback: jest.fn().mockResolvedValue({
    tokens: { access_token: 'token-123' },
    userInfo: { id: 'user-123', email: 'test@example.com' },
    provider: { id: 'provider-123', type: 'github' },
    oauthState: { state: 'state-123' }
  }),
  createAgentConnection: jest.fn().mockResolvedValue({
    id: 'connection-123',
    agentId: 'agent-123',
    providerId: 'provider-123',
    isActive: true
  }),
  recordAgentOperation: jest.fn().mockResolvedValue(undefined)
});

// Mock EnhancedAuthService
export const createMockEnhancedAuthService = () => ({
  authenticateWithOAuth: jest.fn().mockResolvedValue({
    user: {
      id: 'user-123',
      email: 'test@example.com',
      userType: 'human'
    },
    session: {
      id: 'session-123',
      token: 'jwt-token-123'
    },
    securityContext: {
      userId: 'user-123',
      sessionId: 'session-123',
      securityLevel: 'medium'
    }
  }),
  createSecurityContext: jest.fn().mockResolvedValue({
    userId: 'user-123',
    sessionId: 'session-123',
    userType: 'human',
    securityLevel: 'medium',
    permissions: ['read'],
    mfaVerified: false,
    riskScore: 2
  }),
  validateSession: jest.fn().mockResolvedValue(true),
  refreshToken: jest.fn().mockResolvedValue({
    token: 'new-jwt-token-123',
    refreshToken: 'new-refresh-token-123'
  })
});