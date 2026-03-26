import { SecurityLevel, RiskLevel, User } from '@uaip/types';

// Mock DatabaseService
export const createMockDatabaseService = (): unknown => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  healthCheck: vi.fn().mockResolvedValue({
    status: 'healthy',
    details: {
      connected: true,
      totalConnections: 1,
      idleConnections: 0,
      waitingConnections: 0,
      responseTime: 5,
    },
  }),
  close: vi.fn().mockResolvedValue(undefined),

  // User operations
  createUser: vi.fn().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getUserById: vi.fn().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    isActive: true,
  }),
  getUserByUsername: vi.fn().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    passwordHash: '$2b$08$test.hash.here',
    isActive: true,
  }),
  getUserByEmail: vi.fn().mockResolvedValue({
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    isActive: true,
  }),
  updateUser: vi.fn().mockResolvedValue({
    id: 'user-123',
    username: 'updateduser',
    email: 'updated@example.com',
    role: 'user',
    isActive: true,
  }),
  deleteUser: vi.fn().mockResolvedValue(true),
  findUsers: vi.fn().mockResolvedValue([
    {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      isActive: true,
    },
  ]),

  // Audit operations
  createAuditLog: vi.fn().mockResolvedValue({
    id: 'audit-123',
    userId: 'user-123',
    action: 'LOGIN',
    resource: 'auth',
    details: {},
    timestamp: new Date(),
    ipAddress: '127.0.0.1',
  }),
  getAuditLogs: vi.fn().mockResolvedValue([
    {
      id: 'audit-123',
      userId: 'user-123',
      action: 'LOGIN',
      resource: 'auth',
      timestamp: new Date(),
    },
  ]),

  // Approval workflow operations
  createApprovalRequest: vi.fn().mockResolvedValue({
    id: 'approval-123',
    requesterId: 'user-123',
    operation: 'HIGH_RISK_OPERATION',
    status: 'pending',
    createdAt: new Date(),
  }),
  getApprovalRequest: vi.fn().mockResolvedValue({
    id: 'approval-123',
    requesterId: 'user-123',
    operation: 'HIGH_RISK_OPERATION',
    status: 'pending',
  }),
  updateApprovalRequest: vi.fn().mockResolvedValue({
    id: 'approval-123',
    status: 'approved',
    approvedBy: 'admin-123',
    approvedAt: new Date(),
  }),
  getPendingApprovals: vi.fn().mockResolvedValue([
    {
      id: 'approval-123',
      operation: 'HIGH_RISK_OPERATION',
      status: 'pending',
      createdAt: new Date(),
    },
  ]),

  // Authentication operations
  createRefreshToken: vi.fn().mockResolvedValue({
    id: 'refresh-123',
    token: 'refresh.token.here',
    userId: 'user-123',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
  }),
  resetUserLoginAttempts: vi.fn().mockResolvedValue(true),
  updateUserLoginTracking: vi.fn().mockResolvedValue(true),
  getRefreshTokenWithUser: vi.fn().mockResolvedValue({
    id: 'refresh-123',
    token: 'refresh.token.here',
    userId: 'user-123',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    user: {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      isActive: true,
    },
  }),
  revokeRefreshToken: vi.fn().mockResolvedValue(true),
  updateUserPassword: vi.fn().mockResolvedValue(true),
  revokeAllUserRefreshTokens: vi.fn().mockResolvedValue(true),
  createPasswordResetToken: vi.fn().mockResolvedValue({
    id: 'reset-123',
    token: 'reset.token.here',
    userId: 'user-123',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
  }),
  getPasswordResetTokenWithUser: vi.fn().mockResolvedValue({
    id: 'reset-123',
    token: 'reset.token.here',
    userId: 'user-123',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    user: {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      role: 'user',
      isActive: true,
    },
  }),
  markPasswordResetTokenAsUsed: vi.fn().mockResolvedValue(true),
  getUserHighestRole: vi.fn().mockResolvedValue('user'),

  // Agent usage tracking
  getAgentHourlyUsage: vi.fn().mockResolvedValue(5),
  getAgentDailyUsage: vi.fn().mockResolvedValue(50),

  // OAuth provider operations
  createOAuthProvider: vi.fn().mockResolvedValue({
    id: 'provider-123',
    type: 'github',
    isEnabled: true,
  }),
  getOAuthState: vi.fn().mockResolvedValue({
    state: 'state-123',
    providerId: 'provider-123',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  }),
  getAgentOAuthConnection: vi.fn().mockResolvedValue({
    id: 'connection-123',
    agentId: 'agent-123',
    providerId: 'provider-123',
    isActive: true,
  }),
  updateAgentOAuthConnection: vi.fn().mockResolvedValue(true),
  getUserByOAuthProvider: vi.fn().mockResolvedValue(null),
});

// Mock EventBusService
export const createMockEventBusService = (): unknown => ({
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock RedisService
export const createMockRedisService = (): unknown => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
});

// Mock SecurityValidationService
export const createMockSecurityValidationService = (): unknown => ({
  validateOperation: vi.fn().mockResolvedValue({
    allowed: true,
    riskLevel: SecurityLevel.MEDIUM,
    approvalRequired: false,
    conditions: [],
    reasoning: 'Operation approved',
  }),
  assessRisk: vi.fn().mockResolvedValue({
    level: SecurityLevel.MEDIUM,
    overallRisk: RiskLevel.LOW,
    score: 25,
    factors: [],
    recommendations: [],
    mitigations: [],
    assessedAt: new Date(),
    assessedBy: 'system',
  }),
  filterSensitiveData: vi.fn().mockImplementation((data) => data),
  createApprovalWorkflow: vi.fn().mockResolvedValue('workflow-123'),
});

// Mock NotificationService
export const createMockNotificationService = (): unknown => ({
  sendEmail: vi.fn().mockResolvedValue({
    messageId: 'msg-123',
    status: 'sent',
  }),
  sendApprovalNotification: vi.fn().mockResolvedValue(true),
  sendSecurityAlert: vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  sendWelcomeEmail: vi.fn().mockResolvedValue(true),
});

// Mock AuditService
export const createMockAuditService = (): unknown => ({
  logEvent: vi.fn().mockResolvedValue({
    id: 'audit-123',
    timestamp: new Date(),
    eventType: 'SECURITY_EVENT',
    severity: 'INFO',
    message: 'Test audit event',
  }),
  logSecurityEvent: vi.fn().mockResolvedValue({
    id: 'security-audit-123',
    timestamp: new Date(),
    eventType: 'SECURITY_EVENT',
    severity: 'WARNING',
  }),
  logUserAction: vi.fn().mockResolvedValue({
    id: 'user-action-123',
    timestamp: new Date(),
    eventType: 'USER_ACTION',
    severity: 'INFO',
  }),
  logSystemEvent: vi.fn().mockResolvedValue({
    id: 'system-event-123',
    timestamp: new Date(),
    eventType: 'SYSTEM_EVENT',
    severity: 'INFO',
  }),
  queryEvents: vi.fn().mockResolvedValue([
    {
      id: 'audit-123',
      timestamp: new Date(),
      eventType: 'SECURITY_EVENT',
      severity: 'INFO',
      message: 'Test audit event',
    },
  ]),
  getEventsByUser: vi.fn().mockResolvedValue([]),
  getEventsByType: vi.fn().mockResolvedValue([]),
  getEventsInTimeRange: vi.fn().mockResolvedValue([]),
  searchEvents: vi.fn().mockResolvedValue([]),
});

// Mock ApprovalWorkflowService
export const createMockApprovalWorkflowService = (): unknown => ({
  createApprovalRequest: vi.fn().mockResolvedValue({
    id: 'approval-123',
    requesterId: 'user-123',
    operation: 'HIGH_RISK_OPERATION',
    status: 'pending',
    createdAt: new Date(),
  }),
  createApprovalWorkflow: vi.fn().mockResolvedValue({
    id: 'workflow-123',
    operationId: 'operation-123',
    status: 'pending',
    createdAt: new Date(),
  }),
  processApproval: vi.fn().mockResolvedValue({
    id: 'approval-123',
    status: 'approved',
    approvedBy: 'admin-123',
  }),
  rejectApproval: vi.fn().mockResolvedValue({
    id: 'approval-123',
    status: 'rejected',
    rejectedBy: 'admin-123',
    reason: 'Security concerns',
  }),
  getPendingApprovals: vi.fn().mockResolvedValue([
    {
      id: 'approval-123',
      operation: 'HIGH_RISK_OPERATION',
      status: 'pending',
    },
  ]),
  getApprovalHistory: vi.fn().mockResolvedValue([
    {
      id: 'approval-123',
      status: 'approved',
      processedAt: new Date(),
    },
  ]),
});

// Mock LLMProviderManagementService
export const createMockLLMProviderManagementService = (): unknown => ({
  createProvider: vi.fn().mockResolvedValue({
    id: 'provider-123',
    name: 'OpenAI',
    type: 'openai',
    isActive: true,
    createdAt: new Date(),
  }),
  getProvider: vi.fn().mockResolvedValue({
    id: 'provider-123',
    name: 'OpenAI',
    type: 'openai',
    isActive: true,
  }),
  updateProvider: vi.fn().mockResolvedValue({
    id: 'provider-123',
    name: 'OpenAI Updated',
    isActive: true,
  }),
  deleteProvider: vi.fn().mockResolvedValue(true),
  listProviders: vi.fn().mockResolvedValue([
    {
      id: 'provider-123',
      name: 'OpenAI',
      type: 'openai',
      isActive: true,
    },
  ]),
  testProviderConnection: vi.fn().mockResolvedValue({
    success: true,
    latency: 150,
    timestamp: new Date(),
  }),
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
  ...overrides,
});

// Mock bcrypt for password hashing
export const createMockBcrypt = (): unknown => ({
  hash: vi.fn().mockResolvedValue('$2b$08$test.hash.here'),
  compare: vi.fn().mockResolvedValue(true),
  genSalt: vi.fn().mockResolvedValue('$2b$08$test.salt.here'),
});

// Mock jsonwebtoken
export const createMockJWT = (): unknown => ({
  sign: vi.fn().mockReturnValue('test.jwt.token'),
  verify: vi.fn().mockReturnValue({
    userId: 'user-123',
    username: 'testuser',
    role: 'user',
  }),
  decode: vi.fn().mockReturnValue({
    userId: 'user-123',
    username: 'testuser',
    role: 'user',
  }),
});

// Mock OAuthProviderService
export const createMockOAuthProviderService = (): unknown => ({
  validateAgentOperation: vi.fn().mockResolvedValue({
    allowed: true,
    reason: 'Valid operation',
  }),
  createProvider: vi.fn().mockResolvedValue({
    id: 'provider-123',
    type: 'github',
    isEnabled: true,
  }),
  getProvider: vi.fn().mockResolvedValue({
    id: 'provider-123',
    type: 'github',
    isEnabled: true,
  }),
  generateAuthorizationUrl: vi.fn().mockResolvedValue({
    url: 'https://github.com/login/oauth/authorize',
    state: 'state-123',
    codeVerifier: 'verifier-123',
  }),
  handleCallback: vi.fn().mockResolvedValue({
    tokens: { access_token: 'token-123' },
    userInfo: { id: 'user-123', email: 'test@example.com' },
    provider: { id: 'provider-123', type: 'github' },
    oauthState: { state: 'state-123' },
  }),
  createAgentConnection: vi.fn().mockResolvedValue({
    id: 'connection-123',
    agentId: 'agent-123',
    providerId: 'provider-123',
    isActive: true,
  }),
  recordAgentOperation: vi.fn().mockResolvedValue(undefined),
});

// Mock EnhancedAuthService
export const createMockEnhancedAuthService = (): unknown => ({
  authenticateWithOAuth: vi.fn().mockResolvedValue({
    user: {
      id: 'user-123',
      email: 'test@example.com',
      userType: 'human',
    },
    session: {
      id: 'session-123',
      token: 'jwt-token-123',
    },
    securityContext: {
      userId: 'user-123',
      sessionId: 'session-123',
      securityLevel: 'medium',
    },
  }),
  createSecurityContext: vi.fn().mockResolvedValue({
    userId: 'user-123',
    sessionId: 'session-123',
    userType: 'human',
    securityLevel: 'medium',
    permissions: ['read'],
    mfaVerified: false,
    riskScore: 2,
  }),
  validateSession: vi.fn().mockResolvedValue(true),
  refreshToken: vi.fn().mockResolvedValue({
    token: 'new-jwt-token-123',
    refreshToken: 'new-refresh-token-123',
  }),
});
