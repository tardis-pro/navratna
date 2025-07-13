# Security Gateway Service: Technical Debt & Refactoring Plan

**Generated:** 2025-01-13 (Updated)  
**Service:** @uaip/security-gateway  
**Version:** 1.0.0  
**Scope:** Focused refactoring targeting critical infrastructure and organization issues

---

## 📊 Executive Summary

The Security Gateway service analysis reveals **excellent foundational architecture** with focused technical debt primarily around test infrastructure and large file organization. The service is well-designed but needs targeted improvements to restore testing capabilities and improve maintainability.

### Key Findings:
- **18 TypeScript files** (14,784 total lines)
- **0% test coverage** due to infrastructure failures (BLOCKING)
- **6 large files >900 lines** requiring decomposition 
- **Minor JWT validation duplication** (not architectural)
- **Strong service patterns** already in place

---

## 🔍 Detailed Analysis

### Current Service Architecture ✅ STRONG FOUNDATION
```
security-gateway/
├── src/
│   ├── index.ts (352 lines) - BaseService implementation ✅
│   ├── services/ (6,466 lines total)
│   │   ├── enhancedSecurityGatewayService.ts (1,123 lines) 🔶 DECOMPOSE
│   │   ├── securityGatewayService.ts (913 lines) 🔶 DECOMPOSE  
│   │   ├── oauthProviderService.ts (911 lines) 🔶 DECOMPOSE
│   │   ├── auditService.ts (878 lines) 🔶 DECOMPOSE
│   │   ├── enhancedAuthService.ts (730 lines) ✅ GOOD SIZE
│   │   ├── approvalWorkflowService.ts (755 lines) ✅ GOOD SIZE
│   │   ├── notificationService.ts (638 lines) ✅ GOOD SIZE
│   │   └── llmProviderManagementService.ts (518 lines) ✅ GOOD SIZE
│   └── routes/ (8,318 lines total) - Well organized ✅
│       ├── userPersonaRoutes.ts (951 lines) 🔶 SPLIT CONCERNS
│       ├── userRoutes.ts (921 lines) 🔶 SPLIT CONCERNS
│       ├── [other routes] (all <800 lines) ✅ MANAGEABLE
```

**Architecture Strengths:**
- ✅ **BaseService Pattern**: Proper service initialization and lifecycle
- ✅ **Dependency Injection**: Clean service dependencies  
- ✅ **Route Organization**: Well-structured API endpoints
- ✅ **Validation Layer**: Comprehensive Zod schemas
- ✅ **Error Handling**: Consistent ApiError patterns
- ✅ **Middleware Integration**: Proper auth and validation middleware

---

## 🔴 Critical Issues Identified

### 1. Test Infrastructure Collapse 🚨 BLOCKING

**Impact:** Cannot run tests, zero quality assurance coverage

**Root Causes:**
```typescript
// CRITICAL: Missing entity exports in @uaip/shared-services/src/index.ts
import {
  Agent,                          // ❌ Not exported
  User as UserEntity,             // ❌ Not exported  
  SecurityPolicy,                 // ❌ Not exported
  AuditEvent,                     // ❌ Not exported
  Session as SessionEntity,       // ❌ Not exported
  OAuthProvider,                  // ❌ Not exported
  OAuthState as OAuthStateEntity  // ❌ Not exported
} from '@uaip/shared-services';

// ISSUE: ESM import path mismatches
import '../services/enhancedSecurityGatewayService.js' // ❌ Path resolution
```

**Test Failure Analysis:**
- **8 test suites failing** due to import issues
- **1 test suite passing** (security-demo.test.ts)
- **All integration tests blocked** by entity import failures

### 2. Minor JWT Validation Duplication 🔶 CLEANUP NEEDED

**Impact:** Small inconsistency between local and middleware JWT validation

**Issue Analysis:**
```typescript
// CURRENT: Local JWT validation in index.ts (lines 290-321)
private async validateJWTToken(token: string): Promise<any> {
  try {
    // Duplicates @uaip/middleware validateJWTToken functionality
    const result = await validateJWTToken(token);
    // Custom result formatting specific to WebSocket auth
    return {
      valid: result.valid,
      userId: result.userId,
      // ... additional properties
    };
  } catch (error) {
    // Custom error handling
  }
}

// EXISTING: Middleware JWT validation (@uaip/middleware)
export const validateJWTToken = async (token: string): Promise<TokenValidationResult> => {
  // Centralized, well-tested JWT validation
  // Used by all other services consistently
}
```

**Recommendation:** 
- **Keep local method** for WebSocket-specific auth handling
- **Ensure consistency** with middleware implementation
- **No major architectural change needed**

### 3. Large File Organization 🔶 MAINTAINABILITY IMPROVEMENT

**Impact:** Files >900 lines are harder to navigate and maintain

**Files Requiring Decomposition:**
1. **enhancedSecurityGatewayService.ts** (1,123 lines)
   - **Policy Management**: Security policy CRUD operations
   - **Risk Assessment**: Risk calculation and scoring  
   - **Compliance Validation**: Compliance checking logic
   - **Agent Validation**: Agent capability assessment

2. **userPersonaRoutes.ts** (951 lines)
   - **Profile Management**: User profile operations
   - **Persona Management**: User persona CRUD
   - **Preferences**: User preference handling
   - **Analytics**: Usage analytics and reporting

3. **userRoutes.ts** (921 lines)
   - **User CRUD**: Core user management
   - **Authentication**: User auth operations
   - **Settings**: User configuration management

**Recommendation:** Split into focused modules while preserving API contracts

---

## 🎯 Focused Refactoring Plan

Based on the **actual analysis**, the Security Gateway needs targeted improvements rather than massive architectural changes. The service has excellent foundations but requires specific fixes.

### **Phase 1: Critical Infrastructure Repair** (Week 1) 🚨 BLOCKING

#### **Task 1.1: Fix Test Infrastructure**
**Priority:** CRITICAL | **Effort:** 2 days | **Impact:** Restore testing capability

**Root Cause:** Missing entity exports in shared services
```typescript
// MIXED RESPONSIBILITIES - Should be 4+ separate services
export class EnhancedSecurityGatewayService {
  // Policy Management (lines 100-300)
  async createSecurityPolicy(policy: CreateSecurityPolicyRequest): Promise<SecurityPolicy> { /* ... */ }
  async updateSecurityPolicy(policyId: string, updates: UpdateSecurityPolicyRequest): Promise<SecurityPolicy> { /* ... */ }
  async deleteSecurityPolicy(policyId: string): Promise<void> { /* ... */ }
  
  // Risk Assessment (lines 350-500)
  async calculateRiskLevel(request: SecurityValidationRequest): Promise<RiskLevel> { /* ... */ }
  async assessOperationRisk(operation: OperationContext): Promise<RiskAssessment> { /* ... */ }
  
  // Compliance Validation (lines 550-700)
  async validateCompliance(request: ComplianceRequest): Promise<ComplianceResult> { /* ... */ }
  async generateComplianceReport(criteria: ComplianceCriteria): Promise<ComplianceReport> { /* ... */ }
  
  // Audit Processing (lines 750-900)
  async processSecurityEvent(event: SecurityEvent): Promise<void> { /* ... */ }
  async generateSecurityReport(params: ReportParameters): Promise<SecurityReport> { /* ... */ }
  
  // Agent Validation (lines 950-1123)
  async validateAgentCapabilities(agentId: string, capabilities: string[]): Promise<ValidationResult> { /* ... */ }
  async assessAgentRisk(agentId: string, context: OperationContext): Promise<RiskLevel> { /* ... */ }
}
```

**userPersonaRoutes.ts (951 lines)**
```typescript
// MIXING DIFFERENT FUNCTIONAL AREAS
const router = express.Router();

// Profile Management (lines 60-300)
router.get('/:userId/profile', async (req, res) => { /* ... */ });
router.put('/:userId/profile', async (req, res) => { /* ... */ });
router.delete('/:userId/profile', async (req, res) => { /* ... */ });

// Persona Management (lines 350-600)  
router.get('/:userId/personas', async (req, res) => { /* ... */ });
router.post('/:userId/personas', async (req, res) => { /* ... */ });
router.put('/:userId/personas/:personaId', async (req, res) => { /* ... */ });

// Preferences Management (lines 650-850)
router.get('/:userId/preferences', async (req, res) => { /* ... */ });
router.put('/:userId/preferences', async (req, res) => { /* ... */ });

// Analytics & Reporting (lines 870-951)
router.get('/:userId/analytics', async (req, res) => { /* ... */ });
router.get('/:userId/usage-stats', async (req, res) => { /* ... */ });
```

### 4. Validation Schema Duplication

**Repeated Validation Patterns:**
```typescript
// LOCATION 1: authRoutes.ts (lines 30-50)
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 'Password must contain uppercase, lowercase, number and special character')
});

// LOCATION 2: userRoutes.ts (lines 45-65)
const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 'Password must contain uppercase, lowercase, number and special character')
});

// LOCATION 3: userPersonaRoutes.ts (lines 25-40)
const personaCreationSchema = z.object({
  name: z.string().min(1, 'Name required'),
  email: z.string().email('Invalid email format'), // Duplicate email validation
  settings: z.object({
    password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).optional()
  })
});
```

### 5. Audit Logging Pattern Duplication

**Repeated Audit Pattern (20+ instances):**
```typescript
// PATTERN 1: authRoutes.ts
await auditService.logSecurityEvent({
  eventType: AuditEventType.USER_LOGIN_SUCCESS,
  userId: user.id,
  details: {
    email: user.email,
    method: 'password',
    securityLevel: user.securityLevel
  },
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  timestamp: new Date()
});

// PATTERN 2: userRoutes.ts (nearly identical)
await auditService.logSecurityEvent({
  eventType: AuditEventType.USER_PROFILE_UPDATE,
  userId: userId,
  details: {
    updatedFields: Object.keys(updates),
    securityLevel: user.securityLevel
  },
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  timestamp: new Date()
});

// PATTERN 3: approvalRoutes.ts (same structure)
await auditService.logSecurityEvent({
  eventType: AuditEventType.APPROVAL_REQUEST_CREATED,
  userId: req.user.id,
  details: {
    requestType: approvalRequest.type,
    targetId: approvalRequest.targetId
  },
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  timestamp: new Date()
});
```

---

## 🎯 Refactoring Plan

### **Phase 1: Foundation Repair** (Week 1) 🔴 CRITICAL

#### **Task 1.1: Fix Test Infrastructure**
**Priority:** BLOCKING | **Effort:** 2 days | **Impact:** Enable quality assurance

**Root Cause Analysis:**
```typescript
// ISSUE 1: Missing entity exports in @uaip/shared-services
// Current broken imports:
import { Agent, UserEntity, SecurityPolicy } from '@uaip/shared-services';
//        ^^^^^ ^^^^^^^^^ ^^^^^^^^^^^^^^^ Not exported

// SOLUTION: Add to @uaip/shared-services/src/index.ts
export { Agent } from './entities/agent.entity.js';
export { User as UserEntity } from './entities/user.entity.js';
export { SecurityPolicy } from './entities/securityPolicy.entity.js';
export { AuditEvent } from './entities/auditEvent.entity.js';
export { Session as SessionEntity } from './entities/session.entity.js';
export { OAuthProvider } from './entities/oauthProvider.entity.js';
export { OAuthState as OAuthStateEntity } from './entities/oauthState.entity.js';
```

**Jest Configuration Fix:**
```javascript
// jest.config.js - Update for proper ES module handling
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ES2022',
        moduleResolution: 'node',
      }
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**/*',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
```

**Mock Service Fixes:**
```typescript
// src/__tests__/utils/mockServices.ts - Fix constructor signatures
export const createMockAuditService = () => ({
  logSecurityEvent: jest.fn().mockResolvedValue(undefined),
  logEvent: jest.fn().mockResolvedValue(undefined), // Single parameter
  getAuditTrail: jest.fn().mockResolvedValue([]),
  generateReport: jest.fn().mockResolvedValue({}),
});

export const createMockDatabaseService = () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  getUserRepository: jest.fn().mockReturnValue(createMockUserRepository()),
  getAgentRepository: jest.fn().mockReturnValue(createMockAgentRepository()),
  getSessionRepository: jest.fn().mockReturnValue(createMockSessionRepository()),
});
```

#### **Task 1.2: JWT Authentication Consolidation**
**Priority:** CRITICAL (Security) | **Effort:** 3 days | **Impact:** Single source of truth

**New Architecture:**
```typescript
// src/services/core/AuthenticationManager.ts
export class AuthenticationManager {
  private static instance: AuthenticationManager;
  
  public static getInstance(): AuthenticationManager {
    if (!AuthenticationManager.instance) {
      AuthenticationManager.instance = new AuthenticationManager();
    }
    return AuthenticationManager.instance;
  }

  /**
   * Unified JWT token generation with consistent payload structure
   */
  public async generateTokens(user: UserEntity, sessionContext: SessionContext): Promise<TokenResponse> {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: sessionContext.sessionId,
      securityLevel: user.securityLevel || SecurityLevel.MEDIUM,
      complianceFlags: user.complianceFlags || [],
      issuedAt: Date.now(),
      issuer: 'security-gateway'
    };

    try {
      const accessToken = jwt.sign(payload, this.getJWTSecret(), {
        expiresIn: this.getAccessTokenExpiry(),
        algorithm: 'HS256'
      });

      const refreshPayload: RefreshTokenPayload = {
        userId: user.id,
        sessionId: sessionContext.sessionId,
        tokenType: 'refresh'
      };

      const refreshToken = jwt.sign(refreshPayload, this.getRefreshSecret(), {
        expiresIn: this.getRefreshTokenExpiry(),
        algorithm: 'HS256'
      });

      // Log token generation for audit
      await this.auditTokenGeneration(user.id, sessionContext);

      return {
        accessToken,
        refreshToken,
        expiresIn: this.getAccessTokenExpirySeconds(),
        tokenType: 'Bearer',
        securityLevel: payload.securityLevel
      };

    } catch (error) {
      logger.error('Token generation failed', { 
        userId: user.id, 
        sessionId: sessionContext.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AuthenticationError('Failed to generate authentication tokens');
    }
  }

  /**
   * Unified JWT token validation with comprehensive security checks
   */
  public async validateToken(token: string, context?: ValidationContext): Promise<TokenValidationResult> {
    try {
      // Basic JWT validation
      const decoded = jwt.verify(token, this.getJWTSecret(), {
        algorithms: ['HS256']
      }) as JWTPayload;

      // Enhanced validation checks
      const validationResult = await this.performSecurityValidation(decoded, context);
      
      if (!validationResult.valid) {
        return {
          valid: false,
          reason: validationResult.reason,
          securityViolation: validationResult.securityViolation
        };
      }

      // Check user status and session validity
      const userStatus = await this.validateUserStatus(decoded.userId);
      const sessionStatus = await this.validateSessionStatus(decoded.sessionId);

      if (!userStatus.active || !sessionStatus.valid) {
        return {
          valid: false,
          reason: 'User account or session invalid',
          userId: decoded.userId,
          sessionId: decoded.sessionId
        };
      }

      return {
        valid: true,
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        sessionId: decoded.sessionId,
        securityLevel: decoded.securityLevel,
        complianceFlags: decoded.complianceFlags,
        validatedAt: new Date().toISOString()
      };

    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return {
          valid: false,
          reason: 'Token expired',
          expired: true
        };
      } else if (error instanceof jwt.JsonWebTokenError) {
        return {
          valid: false,
          reason: 'Invalid token format',
          malformed: true
        };
      } else {
        logger.error('Token validation error', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          tokenPreview: token.substring(0, 20) + '...'
        });
        return {
          valid: false,
          reason: 'Token validation failed'
        };
      }
    }
  }

  /**
   * Token refresh with security validation
   */
  public async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      const decoded = jwt.verify(refreshToken, this.getRefreshSecret()) as RefreshTokenPayload;
      
      // Validate session and user status
      const user = await this.getUserById(decoded.userId);
      const sessionValid = await this.validateSessionStatus(decoded.sessionId);

      if (!user || !sessionValid.valid) {
        throw new AuthenticationError('Invalid refresh token or session');
      }

      // Generate new token pair
      return await this.generateTokens(user, { sessionId: decoded.sessionId });

    } catch (error) {
      logger.error('Token refresh failed', { error });
      throw new AuthenticationError('Failed to refresh authentication token');
    }
  }

  // Private helper methods
  private async performSecurityValidation(payload: JWTPayload, context?: ValidationContext): Promise<SecurityValidationResult> {
    // Rate limiting check
    const rateLimitResult = await this.checkRateLimit(payload.userId);
    if (!rateLimitResult.allowed) {
      return {
        valid: false,
        reason: 'Rate limit exceeded',
        securityViolation: true
      };
    }

    // Suspicious activity detection
    const suspiciousActivity = await this.detectSuspiciousActivity(payload, context);
    if (suspiciousActivity.detected) {
      return {
        valid: false,
        reason: 'Suspicious activity detected',
        securityViolation: true
      };
    }

    // Compliance checks
    const complianceResult = await this.validateCompliance(payload);
    if (!complianceResult.compliant) {
      return {
        valid: false,
        reason: 'Compliance violation',
        securityViolation: true
      };
    }

    return { valid: true };
  }

  private getJWTSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable not configured');
    }
    return secret;
  }

  private getRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET environment variable not configured');
    }
    return secret;
  }

  private getAccessTokenExpiry(): string {
    return process.env.JWT_EXPIRY || '1h';
  }

  private getRefreshTokenExpiry(): string {
    return process.env.JWT_REFRESH_EXPIRY || '7d';
  }

  private getAccessTokenExpirySeconds(): number {
    const expiry = this.getAccessTokenExpiry();
    // Convert expiry string to seconds
    const timeMap: { [key: string]: number } = { h: 3600, m: 60, s: 1, d: 86400 };
    const match = expiry.match(/^(\d+)([hmsd])$/);
    if (match) {
      return parseInt(match[1]) * timeMap[match[2]];
    }
    return 3600; // Default 1 hour
  }
}

// Supporting types
interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
  securityLevel: SecurityLevel;
  complianceFlags: string[];
  issuedAt: number;
  issuer: string;
}

interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  tokenType: 'refresh';
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  securityLevel: SecurityLevel;
}

interface TokenValidationResult {
  valid: boolean;
  reason?: string;
  userId?: string;
  email?: string;
  role?: string;
  sessionId?: string;
  securityLevel?: SecurityLevel;
  complianceFlags?: string[];
  validatedAt?: string;
  expired?: boolean;
  malformed?: boolean;
  securityViolation?: boolean;
}

interface SessionContext {
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
}

interface ValidationContext {
  ipAddress?: string;
  userAgent?: string;
  requestPath?: string;
  requestMethod?: string;
}

export enum SecurityLevel {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}
```

**Middleware Integration:**
```typescript
// src/middleware/authMiddleware.ts
import { AuthenticationManager } from '../services/core/AuthenticationManager.js';

export const createAuthMiddleware = (options: AuthMiddlewareOptions = {}) => {
  const authManager = AuthenticationManager.getInstance();
  
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractTokenFromRequest(req);
      
      if (!token) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'No authentication token provided'
        });
      }

      const validationContext: ValidationContext = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestPath: req.path,
        requestMethod: req.method
      };

      const result = await authManager.validateToken(token, validationContext);
      
      if (!result.valid) {
        return res.status(401).json({
          error: 'Authentication failed',
          message: result.reason || 'Invalid authentication token'
        });
      }

      // Attach user context to request
      req.user = {
        id: result.userId!,
        email: result.email!,
        role: result.role!,
        securityLevel: result.securityLevel!,
        sessionId: result.sessionId!,
        complianceFlags: result.complianceFlags || []
      };

      next();

    } catch (error) {
      logger.error('Authentication middleware error', { error });
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication processing failed'
      });
    }
  };
};

const extractTokenFromRequest = (req: Request): string | null => {
  // Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Token in query parameter (for WebSocket upgrade requests)
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }

  // Token in cookies (if configured)
  if (req.cookies && req.cookies.authToken) {
    return req.cookies.authToken;
  }

  return null;
};

interface AuthMiddlewareOptions {
  requireSecurityLevel?: SecurityLevel;
  allowedRoles?: string[];
  skipPaths?: string[];
}
```

### **Phase 2: Service Architecture** (Week 2) 🟠 HIGH

#### **Task 2.1: Service Initialization Pattern Consolidation**
**Priority:** HIGH | **Effort:** 2 days | **Impact:** 40% code reduction

**Base Route Handler:**
```typescript
// src/routes/base/BaseRouteHandler.ts
export abstract class BaseRouteHandler {
  protected databaseService: DatabaseService;
  protected auditService: AuditService;
  protected authManager: AuthenticationManager;
  protected initialized = false;

  constructor() {
    this.databaseService = null as any;
    this.auditService = null as any;
    this.authManager = AuthenticationManager.getInstance();
  }

  /**
   * Initialize services with proper error handling and logging
   */
  protected async initializeServices(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize database service
      this.databaseService = new DatabaseService();
      await this.databaseService.initialize();

      // Initialize audit service
      this.auditService = new AuditService();

      this.initialized = true;
      logger.info(`${this.constructor.name} services initialized successfully`);

    } catch (error) {
      logger.error(`Failed to initialize ${this.constructor.name} services`, { error });
      throw new ServiceInitializationError(`Service initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Ensure services are initialized before use
   */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeServices();
    }
  }

  /**
   * Standard error handler for all route operations
   */
  protected handleRouteError(error: any, res: Response, operation: string, context?: any): void {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.error(`Route operation failed: ${operation}`, {
      errorId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp: new Date().toISOString()
    });

    // Determine appropriate status code
    let statusCode = 500;
    let errorType = 'Internal Server Error';
    
    if (error instanceof ValidationError) {
      statusCode = 400;
      errorType = 'Validation Error';
    } else if (error instanceof AuthenticationError) {
      statusCode = 401;
      errorType = 'Authentication Error';
    } else if (error instanceof AuthorizationError) {
      statusCode = 403;
      errorType = 'Authorization Error';
    } else if (error instanceof NotFoundError) {
      statusCode = 404;
      errorType = 'Not Found';
    }

    res.status(statusCode).json({
      error: errorType,
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      errorId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Standard audit logging for route operations
   */
  protected async logAuditEvent(
    eventType: AuditEventType,
    userId: string,
    details: any,
    req: Request
  ): Promise<void> {
    try {
      await this.auditService.logSecurityEvent({
        eventType,
        userId,
        details,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string,
        endpoint: `${req.method} ${req.path}`
      });
    } catch (error) {
      logger.error('Failed to log audit event', { 
        eventType, 
        userId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      // Don't throw - audit failure shouldn't break the main operation
    }
  }

  /**
   * Standard validation helper
   */
  protected validateRequest<T>(data: any, schema: z.ZodSchema<T>): T {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError('Request validation failed');
        validationError.details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        throw validationError;
      }
      throw error;
    }
  }

  /**
   * Standard success response helper
   */
  protected sendSuccessResponse<T>(res: Response, data: T, message?: string, statusCode = 200): void {
    res.status(statusCode).json({
      success: true,
      data,
      message: message || 'Operation completed successfully',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Standard pagination helper
   */
  protected getPaginationParams(req: Request): PaginationParams {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const offset = (page - 1) * limit;

    return { page, limit, offset };
  }

  /**
   * Standard sorting helper
   */
  protected getSortParams(req: Request, allowedFields: string[]): SortParams {
    const sortBy = req.query.sortBy as string;
    const sortOrder = (req.query.sortOrder as string)?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    if (sortBy && !allowedFields.includes(sortBy)) {
      throw new ValidationError(`Invalid sort field: ${sortBy}. Allowed fields: ${allowedFields.join(', ')}`);
    }

    return {
      sortBy: sortBy || allowedFields[0],
      sortOrder
    };
  }
}

// Supporting classes and interfaces
export class ServiceInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceInitializationError';
  }
}

export class ValidationError extends Error {
  public details?: any;
  
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

interface SortParams {
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
}
```

**Updated Route Implementation:**
```typescript
// src/routes/authRoutes.ts - Refactored using BaseRouteHandler
import { BaseRouteHandler } from './base/BaseRouteHandler.js';
import { AuthenticationManager } from '../services/core/AuthenticationManager.js';

class AuthRoutesHandler extends BaseRouteHandler {
  private router = express.Router();

  constructor() {
    super();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.post('/login', this.login.bind(this));
    this.router.post('/register', this.register.bind(this));
    this.router.post('/refresh', this.refreshToken.bind(this));
    this.router.post('/logout', this.logout.bind(this));
    this.router.post('/forgot-password', this.forgotPassword.bind(this));
    this.router.post('/reset-password', this.resetPassword.bind(this));
  }

  /**
   * User login endpoint
   */
  private async login(req: Request, res: Response): Promise<void> {
    try {
      await this.ensureInitialized();

      // Validate request
      const loginData = this.validateRequest(req.body, loginSchema);

      // Find user
      const userRepository = this.databaseService.getUserRepository();
      const user = await userRepository.findByEmail(loginData.email);

      if (!user || !await bcrypt.compare(loginData.password, user.passwordHash)) {
        await this.logAuditEvent(
          AuditEventType.USER_LOGIN_FAILED,
          loginData.email,
          { reason: 'Invalid credentials' },
          req
        );
        
        this.handleRouteError(
          new AuthenticationError('Invalid email or password'),
          res,
          'login',
          { email: loginData.email }
        );
        return;
      }

      // Check account status
      if (!user.isActive || user.isLocked) {
        await this.logAuditEvent(
          AuditEventType.USER_LOGIN_FAILED,
          user.id,
          { reason: 'Account inactive or locked' },
          req
        );
        
        this.handleRouteError(
          new AuthenticationError('Account is inactive or locked'),
          res,
          'login',
          { userId: user.id }
        );
        return;
      }

      // Create session
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const sessionContext: SessionContext = {
        sessionId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      };

      // Generate tokens using centralized AuthenticationManager
      const tokenResponse = await this.authManager.generateTokens(user, sessionContext);

      // Update last login
      await userRepository.updateLastLogin(user.id, new Date());

      // Log successful login
      await this.logAuditEvent(
        AuditEventType.USER_LOGIN_SUCCESS,
        user.id,
        { 
          email: user.email,
          securityLevel: user.securityLevel,
          sessionId 
        },
        req
      );

      this.sendSuccessResponse(res, {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          securityLevel: user.securityLevel
        },
        ...tokenResponse
      }, 'Login successful');

    } catch (error) {
      this.handleRouteError(error, res, 'login');
    }
  }

  /**
   * Token refresh endpoint
   */
  private async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      await this.ensureInitialized();

      const { refreshToken } = this.validateRequest(req.body, refreshTokenSchema);

      // Use centralized token refresh
      const tokenResponse = await this.authManager.refreshToken(refreshToken);

      this.sendSuccessResponse(res, tokenResponse, 'Token refreshed successfully');

    } catch (error) {
      this.handleRouteError(error, res, 'refreshToken');
    }
  }

  public getRouter(): express.Router {
    return this.router;
  }
}

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

// Export router instance
const authRoutesHandler = new AuthRoutesHandler();
export default authRoutesHandler.getRouter();
```

#### **Task 2.2: Large File Decomposition**

**enhancedSecurityGatewayService.ts Split:**
```typescript
// src/services/security/SecurityPolicyManager.ts
export class SecurityPolicyManager {
  constructor(
    private databaseService: DatabaseService,
    private auditService: AuditService
  ) {}

  async createSecurityPolicy(request: CreateSecurityPolicyRequest): Promise<SecurityPolicy> {
    try {
      // Validate policy configuration
      this.validatePolicyConfiguration(request);

      const policy = await this.databaseService.getSecurityPolicyRepository().create({
        name: request.name,
        description: request.description,
        type: request.type,
        rules: request.rules,
        priority: request.priority || 100,
        isActive: request.isActive ?? true,
        createdBy: request.createdBy,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await this.auditService.logSecurityEvent({
        eventType: AuditEventType.SECURITY_POLICY_CREATED,
        userId: request.createdBy,
        details: {
          policyId: policy.id,
          policyName: policy.name,
          policyType: policy.type
        },
        timestamp: new Date()
      });

      return policy;

    } catch (error) {
      logger.error('Failed to create security policy', { error, request });
      throw new SecurityPolicyError(`Failed to create security policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateSecurityPolicy(policyId: string, updates: UpdateSecurityPolicyRequest): Promise<SecurityPolicy> {
    // Implementation...
  }

  async deleteSecurityPolicy(policyId: string, deletedBy: string): Promise<void> {
    // Implementation...
  }

  private validatePolicyConfiguration(request: CreateSecurityPolicyRequest): void {
    // Validation logic...
  }
}

// src/services/security/RiskAssessmentService.ts
export class RiskAssessmentService {
  constructor(
    private databaseService: DatabaseService,
    private securityPolicyManager: SecurityPolicyManager
  ) {}

  async calculateRiskLevel(request: SecurityValidationRequest): Promise<RiskLevel> {
    try {
      const factors = await this.gatherRiskFactors(request);
      const riskScore = this.calculateRiskScore(factors);
      const riskLevel = this.mapScoreToLevel(riskScore);

      logger.info('Risk assessment completed', {
        requestId: request.id,
        riskScore,
        riskLevel,
        factors: Object.keys(factors)
      });

      return {
        level: riskLevel,
        score: riskScore,
        factors: factors,
        timestamp: new Date(),
        assessmentId: `risk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

    } catch (error) {
      logger.error('Risk assessment failed', { error, request });
      throw new RiskAssessmentError(`Risk assessment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async gatherRiskFactors(request: SecurityValidationRequest): Promise<RiskFactors> {
    // Gather various risk factors
    return {
      userRisk: await this.assessUserRisk(request.userId),
      operationRisk: await this.assessOperationRisk(request.operation),
      contextRisk: await this.assessContextRisk(request.context),
      timeRisk: this.assessTimeBasedRisk(request.timestamp),
      locationRisk: await this.assessLocationRisk(request.ipAddress)
    };
  }

  private calculateRiskScore(factors: RiskFactors): number {
    // Risk calculation algorithm
    const weights = {
      userRisk: 0.3,
      operationRisk: 0.25,
      contextRisk: 0.2,
      timeRisk: 0.15,
      locationRisk: 0.1
    };

    return Object.entries(factors).reduce((total, [factor, value]) => {
      const weight = weights[factor as keyof RiskFactors] || 0;
      return total + (value * weight);
    }, 0);
  }

  private mapScoreToLevel(score: number): SecurityLevel {
    if (score >= 0.8) return SecurityLevel.CRITICAL;
    if (score >= 0.6) return SecurityLevel.HIGH;
    if (score >= 0.4) return SecurityLevel.MEDIUM;
    return SecurityLevel.LOW;
  }
}

// src/services/security/ComplianceValidator.ts
export class ComplianceValidator {
  constructor(
    private databaseService: DatabaseService,
    private riskAssessmentService: RiskAssessmentService
  ) {}

  async validateCompliance(request: ComplianceRequest): Promise<ComplianceResult> {
    try {
      const validations = await Promise.all([
        this.validateDataProtection(request),
        this.validateAccessControl(request),
        this.validateAuditRequirements(request),
        this.validateRetentionPolicies(request)
      ]);

      const overallCompliance = validations.every(v => v.compliant);
      const violations = validations.filter(v => !v.compliant);

      return {
        compliant: overallCompliance,
        validations,
        violations,
        timestamp: new Date(),
        complianceLevel: this.determineComplianceLevel(validations)
      };

    } catch (error) {
      logger.error('Compliance validation failed', { error, request });
      throw new ComplianceError(`Compliance validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async validateDataProtection(request: ComplianceRequest): Promise<ComplianceValidation> {
    // Data protection validation logic
    return {
      requirement: 'Data Protection',
      compliant: true,
      details: 'All data protection requirements met'
    };
  }

  private determineComplianceLevel(validations: ComplianceValidation[]): ComplianceLevel {
    const compliantCount = validations.filter(v => v.compliant).length;
    const ratio = compliantCount / validations.length;

    if (ratio === 1) return ComplianceLevel.FULL;
    if (ratio >= 0.8) return ComplianceLevel.SUBSTANTIAL;
    if (ratio >= 0.6) return ComplianceLevel.PARTIAL;
    return ComplianceLevel.NON_COMPLIANT;
  }
}
```

**userPersonaRoutes.ts Split:**
```typescript
// src/routes/user/userProfileRoutes.ts
class UserProfileRoutesHandler extends BaseRouteHandler {
  private router = express.Router();

  constructor() {
    super();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/:userId/profile', this.getProfile.bind(this));
    this.router.put('/:userId/profile', this.updateProfile.bind(this));
    this.router.delete('/:userId/profile', this.deleteProfile.bind(this));
    this.router.get('/:userId/profile/history', this.getProfileHistory.bind(this));
  }

  private async getProfile(req: Request, res: Response): Promise<void> {
    try {
      await this.ensureInitialized();
      
      const { userId } = req.params;
      const userRepository = this.databaseService.getUserRepository();
      
      const profile = await userRepository.getProfile(userId);
      if (!profile) {
        throw new NotFoundError('User profile not found');
      }

      await this.logAuditEvent(
        AuditEventType.USER_PROFILE_ACCESSED,
        userId,
        { accessedBy: req.user.id },
        req
      );

      this.sendSuccessResponse(res, profile);

    } catch (error) {
      this.handleRouteError(error, res, 'getProfile', { userId: req.params.userId });
    }
  }

  // Additional profile management methods...

  public getRouter(): express.Router {
    return this.router;
  }
}

// src/routes/user/userPersonaRoutes.ts - Focused on personas only
class UserPersonaRoutesHandler extends BaseRouteHandler {
  private router = express.Router();

  constructor() {
    super();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/:userId/personas', this.getPersonas.bind(this));
    this.router.post('/:userId/personas', this.createPersona.bind(this));
    this.router.put('/:userId/personas/:personaId', this.updatePersona.bind(this));
    this.router.delete('/:userId/personas/:personaId', this.deletePersona.bind(this));
  }

  private async getPersonas(req: Request, res: Response): Promise<void> {
    try {
      await this.ensureInitialized();
      
      const { userId } = req.params;
      const pagination = this.getPaginationParams(req);
      const sort = this.getSortParams(req, ['name', 'createdAt', 'updatedAt']);

      const personaRepository = this.databaseService.getPersonaRepository();
      const personas = await personaRepository.findByUserId(userId, pagination, sort);

      this.sendSuccessResponse(res, personas);

    } catch (error) {
      this.handleRouteError(error, res, 'getPersonas', { userId: req.params.userId });
    }
  }

  // Additional persona management methods...

  public getRouter(): express.Router {
    return this.router;
  }
}

// src/routes/user/userPreferencesRoutes.ts - User preferences only
class UserPreferencesRoutesHandler extends BaseRouteHandler {
  // Preferences-specific implementation...
}
```

### **Phase 3: Error Handling & Validation** (Week 3) 🟡 MEDIUM

#### **Task 3.1: Standardized Error Handling**

**Central Error Handler:**
```typescript
// src/utils/ErrorHandler.ts
export class StandardErrorHandler {
  private static instance: StandardErrorHandler;

  public static getInstance(): StandardErrorHandler {
    if (!StandardErrorHandler.instance) {
      StandardErrorHandler.instance = new StandardErrorHandler();
    }
    return StandardErrorHandler.instance;
  }

  /**
   * Express error handling middleware
   */
  public createErrorMiddleware() {
    return (error: any, req: Request, res: Response, next: NextFunction) => {
      const errorResponse = this.processError(error, req);
      res.status(errorResponse.statusCode).json(errorResponse.body);
    };
  }

  /**
   * Process error into standardized response
   */
  public processError(error: any, req?: Request): ErrorResponse {
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();

    // Log error with context
    this.logError(error, errorId, req);

    // Determine error type and response
    if (error instanceof ValidationError) {
      return {
        statusCode: 400,
        body: {
          error: 'Validation Error',
          message: error.message,
          details: error.details,
          errorId,
          timestamp
        }
      };
    } else if (error instanceof AuthenticationError) {
      return {
        statusCode: 401,
        body: {
          error: 'Authentication Error',
          message: error.message,
          errorId,
          timestamp
        }
      };
    } else if (error instanceof AuthorizationError) {
      return {
        statusCode: 403,
        body: {
          error: 'Authorization Error',
          message: error.message,
          errorId,
          timestamp
        }
      };
    } else if (error instanceof NotFoundError) {
      return {
        statusCode: 404,
        body: {
          error: 'Not Found',
          message: error.message,
          errorId,
          timestamp
        }
      };
    } else if (error instanceof RateLimitError) {
      return {
        statusCode: 429,
        body: {
          error: 'Rate Limit Exceeded',
          message: error.message,
          retryAfter: error.retryAfter,
          errorId,
          timestamp
        }
      };
    } else {
      // Generic server error
      return {
        statusCode: 500,
        body: {
          error: 'Internal Server Error',
          message: process.env.NODE_ENV === 'production' 
            ? 'An unexpected error occurred' 
            : error.message,
          errorId,
          timestamp
        }
      };
    }
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private logError(error: any, errorId: string, req?: Request): void {
    const logData: any = {
      errorId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    };

    if (req) {
      logData.request = {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: {
          'user-agent': req.headers['user-agent'],
          'x-forwarded-for': req.headers['x-forwarded-for']
        },
        ip: req.ip,
        userId: req.user?.id
      };
    }

    if (error instanceof ValidationError || error instanceof AuthenticationError) {
      logger.warn('Client error occurred', logData);
    } else {
      logger.error('Server error occurred', logData);
    }
  }
}

// Error response interfaces
interface ErrorResponse {
  statusCode: number;
  body: {
    error: string;
    message: string;
    errorId: string;
    timestamp: string;
    details?: any;
    retryAfter?: number;
  };
}

export class RateLimitError extends Error {
  public retryAfter: number;

  constructor(message: string, retryAfter: number = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}
```

#### **Task 3.2: Validation Schema Consolidation**

**Shared Validation Schemas:**
```typescript
// src/validation/authSchemas.ts
export const emailSchema = z.string()
  .email('Invalid email format')
  .min(5, 'Email must be at least 5 characters')
  .max(320, 'Email must be less than 320 characters')
  .transform(email => email.toLowerCase().trim());

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  );

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required')
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be less than 100 characters'),
  acceptTerms: z.boolean().refine(val => val === true, 'You must accept the terms and conditions')
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

// src/validation/userSchemas.ts
export const userIdSchema = z.string().uuid('Invalid user ID format');

export const userUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: emailSchema.optional(),
  phoneNumber: z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format').optional(),
  timezone: z.string().min(1).max(50).optional(),
  language: z.string().min(2).max(10).optional(),
  preferences: z.object({
    notifications: z.boolean().optional(),
    emailUpdates: z.boolean().optional(),
    marketingEmails: z.boolean().optional()
  }).optional()
}).strict();

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "New passwords don't match",
  path: ["confirmPassword"]
});

// src/validation/securitySchemas.ts
export const securityLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const securityPolicySchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().min(10).max(500),
  type: z.enum(['ACCESS_CONTROL', 'DATA_PROTECTION', 'AUDIT', 'COMPLIANCE']),
  rules: z.array(z.object({
    condition: z.string(),
    action: z.enum(['ALLOW', 'DENY', 'REQUIRE_APPROVAL']),
    priority: z.number().min(1).max(1000)
  })),
  priority: z.number().min(1).max(1000).default(100),
  isActive: z.boolean().default(true)
});

export const riskAssessmentSchema = z.object({
  operation: z.string().min(1),
  userId: userIdSchema,
  context: z.object({
    ipAddress: z.string().ip().optional(),
    userAgent: z.string().optional(),
    location: z.string().optional(),
    deviceId: z.string().optional()
  }),
  timestamp: z.date().default(() => new Date())
});

// Validation middleware factory
export const createValidationMiddleware = <T>(schema: z.ZodSchema<T>, source: 'body' | 'params' | 'query' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[source];
      const validated = schema.parse(data);
      
      // Replace the original data with validated/transformed data
      (req as any)[source] = validated;
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ValidationError('Request validation failed');
        validationError.details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
          received: err.received
        }));
        
        const errorHandler = StandardErrorHandler.getInstance();
        const errorResponse = errorHandler.processError(validationError, req);
        return res.status(errorResponse.statusCode).json(errorResponse.body);
      }
      next(error);
    }
  };
};
```

### **Phase 4: Testing & Quality** (Week 4) 🟢 FINAL

#### **Task 4.1: Test Infrastructure Restoration**

**Updated Test Configuration:**
```typescript
// jest.config.js - Complete configuration
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: {
        module: 'ES2022',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        target: 'ES2022'
      }
    }
  },
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@uaip/(.*)$': '<rootDir>/../../shared/$1/src'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/*.test.ts'
  ],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**/*',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    // Service-specific thresholds
    'src/services/core/AuthenticationManager.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    'src/services/security/*.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    }
  },
  testTimeout: 30000,
  maxWorkers: '50%',
  verbose: true
};
```

**Comprehensive Test Suite:**
```typescript
// src/__tests__/unit/AuthenticationManager.test.ts
import { jest } from '@jest/globals';
import { AuthenticationManager, AuthenticationError, SecurityLevel } from '../../services/core/AuthenticationManager.js';
import jwt from 'jsonwebtoken';

describe('AuthenticationManager', () => {
  let authManager: AuthenticationManager;
  let mockDatabaseService: any;
  let mockAuditService: any;

  beforeEach(() => {
    authManager = AuthenticationManager.getInstance();
    
    // Mock environment variables
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.JWT_EXPIRY = '1h';
    process.env.JWT_REFRESH_EXPIRY = '7d';

    // Setup mocks
    mockDatabaseService = {
      getUserRepository: jest.fn().mockReturnValue({
        findById: jest.fn(),
        updateLastLogin: jest.fn().mockResolvedValue(undefined)
      }),
      getSessionRepository: jest.fn().mockReturnValue({
        validateSession: jest.fn().mockResolvedValue({ valid: true })
      })
    };

    mockAuditService = {
      logSecurityEvent: jest.fn().mockResolvedValue(undefined)
    };

    // Inject mocks into manager (would need dependency injection in real implementation)
    (authManager as any).databaseService = mockDatabaseService;
    (authManager as any).auditService = mockAuditService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateTokens', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      role: 'USER',
      securityLevel: SecurityLevel.MEDIUM,
      complianceFlags: ['GDPR']
    };

    const mockSessionContext = {
      sessionId: 'session-123',
      ipAddress: '192.168.1.1',
      userAgent: 'Test-Agent'
    };

    it('should generate valid JWT tokens', async () => {
      const result = await authManager.generateTokens(mockUser, mockSessionContext);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result.tokenType).toBe('Bearer');
      expect(result.securityLevel).toBe(SecurityLevel.MEDIUM);

      // Verify token structure
      const decoded = jwt.verify(result.accessToken, 'test-secret') as any;
      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.role).toBe(mockUser.role);
      expect(decoded.sessionId).toBe(mockSessionContext.sessionId);
    });

    it('should handle missing JWT secret', async () => {
      delete process.env.JWT_SECRET;

      await expect(authManager.generateTokens(mockUser, mockSessionContext))
        .rejects.toThrow('JWT_SECRET environment variable not configured');
    });

    it('should log audit event for token generation', async () => {
      await authManager.generateTokens(mockUser, mockSessionContext);

      expect(mockAuditService.logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: expect.any(String),
          userId: mockUser.id,
          details: expect.objectContaining({
            sessionId: mockSessionContext.sessionId
          })
        })
      );
    });
  });

  describe('validateToken', () => {
    it('should validate legitimate tokens', async () => {
      const tokenPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'USER',
        sessionId: 'session-123',
        securityLevel: SecurityLevel.MEDIUM,
        complianceFlags: ['GDPR']
      };

      const token = jwt.sign(tokenPayload, 'test-secret', { expiresIn: '1h' });

      // Mock user and session validation
      mockDatabaseService.getUserRepository().findById.mockResolvedValue({
        id: 'user-123',
        isActive: true,
        isLocked: false
      });

      const result = await authManager.validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('user-123');
      expect(result.email).toBe('test@example.com');
      expect(result.role).toBe('USER');
    });

    it('should reject expired tokens', async () => {
      const tokenPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'USER'
      };

      const token = jwt.sign(tokenPayload, 'test-secret', { expiresIn: '-1h' });

      const result = await authManager.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Token expired');
      expect(result.expired).toBe(true);
    });

    it('should reject malformed tokens', async () => {
      const result = await authManager.validateToken('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid token format');
      expect(result.malformed).toBe(true);
    });

    it('should validate with security context', async () => {
      const tokenPayload = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'USER',
        sessionId: 'session-123',
        securityLevel: SecurityLevel.HIGH
      };

      const token = jwt.sign(tokenPayload, 'test-secret');
      const validationContext = {
        ipAddress: '192.168.1.1',
        userAgent: 'Test-Agent',
        requestPath: '/api/secure-endpoint'
      };

      // Mock security validation
      mockDatabaseService.getUserRepository().findById.mockResolvedValue({
        id: 'user-123',
        isActive: true,
        isLocked: false
      });

      const result = await authManager.validateToken(token, validationContext);

      expect(result.valid).toBe(true);
      expect(result.securityLevel).toBe(SecurityLevel.HIGH);
    });
  });

  describe('refreshToken', () => {
    it('should refresh valid tokens', async () => {
      const refreshPayload = {
        userId: 'user-123',
        sessionId: 'session-123',
        tokenType: 'refresh'
      };

      const refreshToken = jwt.sign(refreshPayload, 'test-refresh-secret');

      // Mock user lookup
      mockDatabaseService.getUserRepository().findById.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        role: 'USER',
        securityLevel: SecurityLevel.MEDIUM,
        isActive: true
      });

      const result = await authManager.refreshToken(refreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.tokenType).toBe('Bearer');
    });

    it('should reject invalid refresh tokens', async () => {
      await expect(authManager.refreshToken('invalid-refresh-token'))
        .rejects.toThrow(AuthenticationError);
    });
  });
});

// src/__tests__/integration/authenticationFlow.integration.test.ts
import supertest from 'supertest';
import { setupTestDatabase, cleanupTestDatabase } from '../setup/testDatabase.js';
import SecurityGatewayServer from '../../index.js';

describe('Authentication Flow Integration', () => {
  let app: any;
  let server: SecurityGatewayServer;
  let testUser: any;

  beforeAll(async () => {
    await setupTestDatabase();
    server = new SecurityGatewayServer();
    await server.start();
    app = server.getApp();

    // Create test user
    testUser = await createTestUser({
      email: 'integration-test@example.com',
      password: 'TestPassword123!',
      name: 'Integration Test User',
      role: 'USER'
    });
  });

  afterAll(async () => {
    await server.stop();
    await cleanupTestDatabase();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should authenticate user with valid credentials', async () => {
      const response = await supertest(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'integration-test@example.com',
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe('integration-test@example.com');
    });

    it('should reject invalid credentials', async () => {
      const response = await supertest(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'integration-test@example.com',
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
      expect(response.body.message).toContain('Invalid email or password');
    });

    it('should validate request format', async () => {
      const response = await supertest(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: '123'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.details).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let validRefreshToken: string;

    beforeEach(async () => {
      const loginResponse = await supertest(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'integration-test@example.com',
          password: 'TestPassword123!'
        });

      validRefreshToken = loginResponse.body.data.refreshToken;
    });

    it('should refresh access token with valid refresh token', async () => {
      const response = await supertest(app)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: validRefreshToken
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('should reject invalid refresh token', async () => {
      const response = await supertest(app)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token'
        })
        .expect(401);

      expect(response.body.error).toBe('Authentication Error');
    });
  });

  describe('Protected endpoints', () => {
    let accessToken: string;

    beforeEach(async () => {
      const loginResponse = await supertest(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'integration-test@example.com',
          password: 'TestPassword123!'
        });

      accessToken = loginResponse.body.data.accessToken;
    });

    it('should access protected endpoint with valid token', async () => {
      const response = await supertest(app)
        .get(`/api/v1/users/${testUser.id}/profile`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject requests without token', async () => {
      const response = await supertest(app)
        .get(`/api/v1/users/${testUser.id}/profile`)
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should reject requests with invalid token', async () => {
      const response = await supertest(app)
        .get(`/api/v1/users/${testUser.id}/profile`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBe('Authentication failed');
    });
  });
});
```

#### **Task 4.2: Performance Optimization**

**Database Query Optimization:**
```typescript
// src/services/performance/QueryOptimizer.ts
export class QueryOptimizer {
  private cacheService: CacheService;
  private metricsCollector: MetricsCollector;

  constructor() {
    this.cacheService = new CacheService();
    this.metricsCollector = new MetricsCollector();
  }

  /**
   * Optimize user lookup queries with caching
   */
  async findUserWithCache(userId: string): Promise<UserEntity | null> {
    const cacheKey = `user:${userId}`;
    
    // Try cache first
    const cachedUser = await this.cacheService.get(cacheKey);
    if (cachedUser) {
      this.metricsCollector.recordCacheHit('user_lookup');
      return JSON.parse(cachedUser);
    }

    // Fetch from database
    const startTime = Date.now();
    const user = await this.databaseService.getUserRepository().findById(userId);
    const queryTime = Date.now() - startTime;

    this.metricsCollector.recordQueryTime('user_lookup', queryTime);
    this.metricsCollector.recordCacheMiss('user_lookup');

    // Cache result for 5 minutes
    if (user) {
      await this.cacheService.set(cacheKey, JSON.stringify(user), 300);
    }

    return user;
  }

  /**
   * Batch user lookups to avoid N+1 queries
   */
  async findUsersBatch(userIds: string[]): Promise<Map<string, UserEntity>> {
    const result = new Map<string, UserEntity>();
    const uncachedIds: string[] = [];

    // Check cache for each user
    for (const userId of userIds) {
      const cacheKey = `user:${userId}`;
      const cachedUser = await this.cacheService.get(cacheKey);
      
      if (cachedUser) {
        result.set(userId, JSON.parse(cachedUser));
        this.metricsCollector.recordCacheHit('user_batch_lookup');
      } else {
        uncachedIds.push(userId);
      }
    }

    // Batch fetch uncached users
    if (uncachedIds.length > 0) {
      const startTime = Date.now();
      const users = await this.databaseService.getUserRepository().findByIds(uncachedIds);
      const queryTime = Date.now() - startTime;

      this.metricsCollector.recordQueryTime('user_batch_lookup', queryTime);
      this.metricsCollector.recordCacheMiss('user_batch_lookup', uncachedIds.length);

      // Cache and add to result
      for (const user of users) {
        result.set(user.id, user);
        const cacheKey = `user:${user.id}`;
        await this.cacheService.set(cacheKey, JSON.stringify(user), 300);
      }
    }

    return result;
  }

  /**
   * Optimize security policy lookups with intelligent caching
   */
  async findSecurityPoliciesOptimized(criteria: PolicySearchCriteria): Promise<SecurityPolicy[]> {
    const cacheKey = `policies:${this.generateCriteriaHash(criteria)}`;
    
    // Check cache
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.metricsCollector.recordCacheHit('policy_lookup');
      return JSON.parse(cached);
    }

    // Optimize query based on criteria
    const optimizedQuery = this.buildOptimizedPolicyQuery(criteria);
    
    const startTime = Date.now();
    const policies = await this.databaseService.getSecurityPolicyRepository().findWithQuery(optimizedQuery);
    const queryTime = Date.now() - startTime;

    this.metricsCollector.recordQueryTime('policy_lookup', queryTime);
    this.metricsCollector.recordCacheMiss('policy_lookup');

    // Cache with appropriate TTL based on policy types
    const ttl = this.calculatePolicyTTL(policies);
    await this.cacheService.set(cacheKey, JSON.stringify(policies), ttl);

    return policies;
  }

  private buildOptimizedPolicyQuery(criteria: PolicySearchCriteria): any {
    // Build efficient database query with proper indexes
    const query: any = {
      where: {},
      order: [],
      relations: []
    };

    // Use indexes for common search patterns
    if (criteria.type) {
      query.where.type = criteria.type;
    }

    if (criteria.isActive !== undefined) {
      query.where.isActive = criteria.isActive;
    }

    if (criteria.priority) {
      query.where.priority = criteria.priority;
    }

    // Optimize ordering
    query.order.push(['priority', 'DESC'], ['updatedAt', 'DESC']);

    // Only load necessary relations
    if (criteria.includeRules) {
      query.relations.push('rules');
    }

    return query;
  }

  private calculatePolicyTTL(policies: SecurityPolicy[]): number {
    // Dynamic TTL based on policy sensitivity
    const hasHighPriority = policies.some(p => p.priority > 800);
    const hasCriticalType = policies.some(p => p.type === 'COMPLIANCE');

    if (hasHighPriority || hasCriticalType) {
      return 60; // 1 minute for critical policies
    } else {
      return 300; // 5 minutes for regular policies
    }
  }
}

// Connection pooling optimization
// src/config/database.ts
export const getDatabaseConfig = (): any => {
  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    
    // Optimized connection pooling
    extra: {
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '20'),
      acquireConnectionTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000'),
      timeout: parseInt(process.env.DB_TIMEOUT || '60000'),
      
      // Connection pool optimization
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      min: parseInt(process.env.DB_POOL_MIN || '5'),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000'),
      acquire: parseInt(process.env.DB_POOL_ACQUIRE || '60000'),
      evict: parseInt(process.env.DB_POOL_EVICT || '1000'),
      
      // Query optimization
      statement_timeout: '30s',
      query_timeout: '30s',
      application_name: 'security-gateway'
    },

    // Entity and migration paths
    entities: ['dist/entities/*.js'],
    migrations: ['dist/migrations/*.js'],
    
    // Performance settings
    synchronize: false,
    logging: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
    logger: 'advanced-console',
    
    // Query result caching
    cache: {
      type: 'redis',
      options: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_CACHE_DB || '1')
      },
      duration: 30000 // 30 seconds default cache
    }
  };
};
```

---

## 📊 Implementation Timeline & Success Metrics

### **Week-by-Week Breakdown**

**Week 1: Foundation Repair** 🔴
- **Days 1-2:** Fix test infrastructure, restore 8 failed test suites
- **Days 3-5:** Implement AuthenticationManager consolidation
- **Expected Outcome:** 0% → 60% test coverage, single JWT implementation

**Week 2: Service Architecture** 🟠  
- **Days 1-2:** Implement BaseRouteHandler pattern, consolidate service initialization
- **Days 3-5:** Split large files (enhancedSecurityGatewayService.ts, userPersonaRoutes.ts)
- **Expected Outcome:** 6+ duplicate patterns eliminated, no files >500 lines

**Week 3: Error Handling & Validation** 🟡
- **Days 1-2:** Implement StandardErrorHandler, consolidate error patterns
- **Days 3-5:** Create shared validation schemas, eliminate duplicate validations
- **Expected Outcome:** Consistent error handling, reusable validation patterns

**Week 4: Testing & Performance** 🟢
- **Days 1-3:** Comprehensive test suite for new patterns, achieve 80% coverage
- **Days 4-5:** Performance optimizations, database query improvements
- **Expected Outcome:** Production-ready refactored service

### **Success Metrics**

**Code Quality:**
- ✅ **Line Reduction:** 35-40% fewer lines through deduplication
- ✅ **File Size:** No files >500 lines (target: <300 lines)  
- ✅ **Test Coverage:** 80% coverage on business logic
- ✅ **Maintainability:** Improved complexity scores across all services

**Security Improvements:**
- ✅ **Single Source of Truth:** Consolidated authentication logic
- ✅ **Consistent Validation:** Standardized security checks
- ✅ **Audit Compliance:** Centralized security logging
- ✅ **Risk Reduction:** Eliminated authentication inconsistencies

**Performance Gains:**
- ✅ **Response Time:** 25% improvement in API response times
- ✅ **Database Efficiency:** Optimized query patterns and connection pooling
- ✅ **Cache Hit Rate:** 80%+ cache hit rate for frequently accessed data
- ✅ **Memory Usage:** Reduced memory footprint through service consolidation

**Development Velocity:**
- ✅ **Bug Fix Time:** 50% reduction in security-related bugs
- ✅ **Feature Development:** 30% faster implementation of new features
- ✅ **Code Review:** Easier review process with focused, smaller files
- ✅ **Developer Onboarding:** Clearer service boundaries and patterns

### **Risk Mitigation Strategy**

**Gradual Migration Approach:**
- Implement new patterns alongside existing ones
- Use feature flags for major changes
- Maintain backward compatibility during transition
- Keep original implementations until new ones are proven

**Quality Assurance:**
- Comprehensive testing before removing old code
- Progressive rollout with monitoring
- Automated regression testing
- Performance benchmarking at each phase

**Rollback Capability:**
- Version control checkpoints at each phase
- Database migration rollback scripts
- Configuration-based pattern switching
- Comprehensive logging for troubleshooting

---

## 🎯 Conclusion

This refactoring plan addresses the most critical technical debt issues in the Security Gateway service while preserving its excellent foundational architecture. The focus on **security consistency**, **code deduplication**, and **maintainability improvements** will significantly enhance the service's robustness and developer experience.

**Key Benefits:**
- **Security Risk Reduction:** Consolidated authentication patterns eliminate inconsistencies
- **Maintenance Efficiency:** 40% code reduction through deduplication
- **Quality Assurance:** Restored test infrastructure with 80% coverage target
- **Performance Optimization:** Database and caching improvements
- **Developer Experience:** Clear patterns, better error handling, easier debugging

The plan follows a **risk-averse, incremental approach** that ensures the service remains stable and secure throughout the refactoring process while delivering substantial improvements in code quality and maintainability.