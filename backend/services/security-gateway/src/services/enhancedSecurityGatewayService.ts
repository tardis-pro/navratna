import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import {
  SecurityValidationRequest,
  SecurityValidationResult,
  EnhancedSecurityValidationRequest,
  EnhancedSecurityContext,
  RiskAssessment,
  RiskFactor,
  SecurityLevel,
  RiskLevel,
  AuditEventType,
  UserType,
  AgentCapability,
  OAuthProviderType,
  AuthenticationMethod,
  MFAMethod,
  ApprovalRequirement
} from '@uaip/types';
import { SecurityGatewayService } from './securityGatewayService.js';
import { OAuthProviderService } from './oauthProviderService.js';
import { EnhancedAuthService } from './enhancedAuthService.js';
import { AuditService } from './auditService.js';
import { ApprovalWorkflowService } from './approvalWorkflowService.js';

export interface AgentSecurityPolicy {
  id: string;
  name: string;
  description: string;
  applicableCapabilities: AgentCapability[];
  allowedProviders: OAuthProviderType[];
  conditions: Record<string, any>;
  actions: {
    allow?: boolean;
    requireApproval?: boolean;
    requiredApprovers?: string[];
    maxRiskLevel?: SecurityLevel;
    additionalValidations?: string[];
    rateLimits?: {
      requestsPerHour: number;
      requestsPerDay: number;
    };
  };
  priority: number;
  isActive: boolean;
}

export class EnhancedSecurityGatewayService extends SecurityGatewayService {
  private agentPolicies: Map<string, AgentSecurityPolicy> = new Map();

  constructor(
    databaseService: DatabaseService,
    approvalWorkflowService: ApprovalWorkflowService,
    auditService: AuditService,
    private oauthProviderService: OAuthProviderService,
    private enhancedAuthService: EnhancedAuthService
  ) {
    super(databaseService, approvalWorkflowService, auditService);
    this.loadAgentSecurityPolicies();
  }

  /**
   * Enhanced security validation with OAuth and agent support
   */
  public async validateEnhancedSecurity(
    request: EnhancedSecurityValidationRequest
  ): Promise<SecurityValidationResult> {
    try {
      logger.info('Validating enhanced security for operation', {
        operationType: request.operation.type,
        resource: request.operation.resource,
        userId: request.securityContext.userId,
        userType: request.securityContext.userType,
        agentCapabilities: request.securityContext.agentCapabilities?.length || 0
      });

      // Validate agent operations if applicable
      if (request.securityContext.userType === UserType.AGENT) {
        await this.validateAgentOperation(request);
      }

      // Check OAuth provider permissions if applicable
      if (request.securityContext.oauthProvider) {
        await this.validateOAuthProviderPermissions(request);
      }

      // Perform enhanced risk assessment
      const riskAssessment = await this.enhancedRiskAssessment(request);

      // Check if operation is allowed based on enhanced context
      const isAllowed = await this.isOperationAllowed(request, riskAssessment);

      // Determine if approval is required
      const approvalRequirement = await this.enhancedApprovalCheck(request, riskAssessment);

      // Check MFA requirements
      const mfaRequirement = await this.checkMFARequirement(request, riskAssessment);

      // Determine agent-specific restrictions
      const agentRestrictions = await this.getAgentRestrictions(request);

      const result: SecurityValidationResult = {
        allowed: isAllowed && !approvalRequirement.required,
        approvalRequired: approvalRequirement.required,
        riskLevel: riskAssessment.level,
        reasoning: this.generateReasoning(request, riskAssessment, approvalRequirement),
        requiredApprovers: approvalRequirement.approvers,
        validUntil: new Date(Date.now() + this.getValidityDuration(riskAssessment.level)),
        mfaRequired: mfaRequirement.required,
        mfaMethods: mfaRequirement.methods,
        agentRestrictions
      };

      // Log the validation event
      await this.auditService.logEvent({
        eventType: result.allowed
          ? AuditEventType.PERMISSION_GRANTED
          : AuditEventType.PERMISSION_DENIED,
        userId: request.securityContext.userType === UserType.AGENT
          ? undefined
          : request.securityContext.userId,
        agentId: request.securityContext.userType === UserType.AGENT
          ? request.securityContext.userId
          : undefined,
        details: {
          operation: request.operation,
          riskLevel: riskAssessment.level,
          approvalRequired: approvalRequirement.required,
          mfaRequired: mfaRequirement.required,
          agentCapabilities: request.securityContext.agentCapabilities,
          oauthProvider: request.securityContext.oauthProvider
        }
      });

      logger.info('Enhanced security validation completed', {
        operationType: request.operation.type,
        allowed: result.allowed,
        approvalRequired: result.approvalRequired,
        riskLevel: result.riskLevel,
        userType: request.securityContext.userType,
        mfaRequired: result.mfaRequired
      });

      return result;
    } catch (error) {
      logger.error('Enhanced security validation failed', {
        operationType: request.operation.type,
        userType: request.securityContext.userType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      await this.auditService.logEvent({
        eventType: AuditEventType.SECURITY_VIOLATION,
        userId: request.securityContext.userId,
        details: {
          error: error.message,
          operation: request.operation,
          securityContext: request.securityContext
        }
      });
      throw error;
    }
  }

  /**
   * Validate agent-specific operations
   */
  private async validateAgentOperation(request: EnhancedSecurityValidationRequest): Promise<void> {
    const agentContext = request.securityContext.agentContext;
    if (!agentContext) {
      throw new ApiError(400, 'Agent context required for agent operations', 'MISSING_AGENT_CONTEXT');
    }

    // Check if agent has required capabilities for the operation
    const requiredCapability = this.getRequiredCapabilityForOperation(request.operation.type);
    if (requiredCapability && !agentContext.capabilities.includes(requiredCapability)) {
      throw new ApiError(403, `Agent lacks required capability: ${requiredCapability}`, 'INSUFFICIENT_CAPABILITY');
    }

    // Check operation limits
    if (agentContext.operationLimits) {
      const limits = agentContext.operationLimits;

      if (limits.maxDailyOperations && limits.currentDailyOperations >= limits.maxDailyOperations) {
        throw new ApiError(429, 'Daily operation limit exceeded', 'DAILY_LIMIT_EXCEEDED');
      }

      if (limits.maxConcurrentOperations && limits.currentConcurrentOperations >= limits.maxConcurrentOperations) {
        throw new ApiError(429, 'Concurrent operation limit exceeded', 'CONCURRENT_LIMIT_EXCEEDED');
      }
    }
  }

  /**
   * Validate OAuth provider permissions
   */
  private async validateOAuthProviderPermissions(request: EnhancedSecurityValidationRequest): Promise<void> {
    const { oauthProvider, userId, agentCapabilities } = request.securityContext;

    if (!oauthProvider) return;

    // For agents, validate OAuth operation permissions
    if (request.securityContext.userType === UserType.AGENT && agentCapabilities) {
      const requiredCapability = this.getRequiredCapabilityForOperation(request.operation.type);
      if (!requiredCapability) return;

      const canPerformOperation = await this.oauthProviderService.validateAgentOperation(
        userId,
        oauthProvider,
        request.operation.type,
        requiredCapability
      );

      if (!canPerformOperation) {
        throw new ApiError(403, 'OAuth provider operation not allowed', 'OAUTH_OPERATION_DENIED');
      }
    }
  }

  /**
   * Enhanced risk assessment including OAuth and agent factors
   */
  private async enhancedRiskAssessment(
    request: EnhancedSecurityValidationRequest
  ): Promise<RiskAssessment> {
    const factors: RiskFactor[] = [];
    let totalScore = 0;

    // Base operation risk
    const operationRisk = this.assessOperationRisk(request.operation);
    factors.push(operationRisk);
    totalScore += operationRisk.score;

    // User type risk
    const userTypeRisk = this.assessUserTypeRisk(request.securityContext.userType);
    factors.push(userTypeRisk);
    totalScore += userTypeRisk.score;

    // Authentication method risk
    const authMethodRisk = this.assessAuthMethodRisk(request.securityContext.authenticationMethod);
    factors.push(authMethodRisk);
    totalScore += authMethodRisk.score;

    // OAuth provider risk (if applicable)
    if (request.securityContext.oauthProvider) {
      const oauthRisk = this.assessOAuthProviderRisk(request.securityContext.oauthProvider);
      factors.push(oauthRisk);
      totalScore += oauthRisk.score;
    }

    // Agent capability risk (if applicable)
    if (request.securityContext.agentCapabilities && request.securityContext.agentCapabilities.length > 0) {
      const capabilityRisk = this.assessAgentCapabilityRisk(request.securityContext.agentCapabilities);
      factors.push(capabilityRisk);
      totalScore += capabilityRisk.score;
    }

    // Session risk factors
    if (request.securityContext.sessionRisk) {
      const sessionRisk: RiskFactor = {
        type: 'session_risk',
        level: this.scoreToRiskLevel(request.securityContext.sessionRisk.score),
        description: `Session risk score: ${request.securityContext.sessionRisk.score}`,
        score: request.securityContext.sessionRisk.score,
        mitigations: request.securityContext.sessionRisk.mitigations
      };
      factors.push(sessionRisk);
      totalScore += sessionRisk.score;
    }

    // MFA verification risk
    if (!request.securityContext.mfaVerified) {
      const mfaRisk: RiskFactor = {
        type: 'mfa_not_verified',
        level: RiskLevel.MEDIUM,
        description: 'Multi-factor authentication not verified',
        score: 2,
        mitigations: ['Require MFA verification']
      };
      factors.push(mfaRisk);
      totalScore += mfaRisk.score;
    }

    // Device trust risk
    if (!request.securityContext.deviceTrusted) {
      const deviceRisk: RiskFactor = {
        type: 'untrusted_device',
        level: RiskLevel.MEDIUM,
        description: 'Device not in trusted device list',
        score: 1,
        mitigations: ['Enhanced monitoring', 'Additional verification']
      };
      factors.push(deviceRisk);
      totalScore += deviceRisk.score;
    }

    // Time-based risk
    const timeRisk = this.assessTimeBasedRisk();
    if (timeRisk.score > 0) {
      factors.push(timeRisk);
      totalScore += timeRisk.score;
    }

    // Calculate overall risk level
    const averageScore = totalScore / factors.length;
    const overallRisk = this.scoreToRiskLevel(averageScore);
    const securityLevel = this.riskToSecurityLevel(overallRisk);

    return {
      level: securityLevel,
      overallRisk,
      score: averageScore,
      factors,
      recommendations: this.generateRecommendations(factors),
      mitigations: this.generateMitigations(factors),
      assessedAt: new Date(),
      validUntil: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    };
  }

  /**
   * Check if operation is allowed based on enhanced context
   */
  private async isOperationAllowed(
    request: EnhancedSecurityValidationRequest,
    riskAssessment: RiskAssessment
  ): Promise<boolean> {
    // Check base security clearance
    if (request.securityContext.securityLevel < riskAssessment.level) {
      return false;
    }

    // Agent-specific validation
    if (request.securityContext.userType === UserType.AGENT) {
      try {
        await this.validateAgentOperation(request);
        return true;
      } catch (error) {
        return false;
      }
    }

    // OAuth provider validation
    if (request.securityContext.oauthProvider) {
      return await this.validateOAuthOperation(request);
    }

    return true;
  }

  /**
   * Validate OAuth operations
   */
  private async validateOAuthOperation(
    request: EnhancedSecurityValidationRequest
  ): Promise<boolean> {
    if (!request.securityContext.oauthProvider) {
      return true;
    }

    // For agent users, validate OAuth connection
    if (request.securityContext.userType === UserType.AGENT) {
      const requiredCapability = this.getRequiredCapabilityForOperation(request.operation.type);
      if (requiredCapability) {
        try {
          const validation = await this.oauthProviderService.validateAgentOperation(
            request.securityContext.userId,
            request.securityContext.oauthProvider,
            request.operation.type,
            requiredCapability
          );
          return validation.allowed;
        } catch (error) {
          logger.error('OAuth operation validation failed', {
            agentId: request.securityContext.userId,
            provider: request.securityContext.oauthProvider,
            operation: request.operation.type,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Enhanced approval check with agent and OAuth considerations
   */
  private async enhancedApprovalCheck(
    request: EnhancedSecurityValidationRequest,
    riskAssessment: RiskAssessment
  ): Promise<ApprovalRequirement> {
    // Base approval check
    const baseRequirement = await this.requiresApproval({
      operation: request.operation,
      securityContext: {
        userId: request.securityContext.userId,
        sessionId: request.securityContext.sessionId,
        ipAddress: request.securityContext.ipAddress,
        userAgent: request.securityContext.userAgent,
        department: request.securityContext.department,
        role: request.securityContext.role,
        permissions: request.securityContext.permissions,
        securityLevel: request.securityContext.securityLevel,
        lastAuthentication: request.securityContext.lastAuthentication,
        mfaVerified: request.securityContext.mfaVerified,
        riskScore: request.securityContext.riskScore
      }
    });

    // Additional approval requirements for agents
    if (request.securityContext.userType === UserType.AGENT) {
      const agentApprovalRequired = this.requiresAgentApproval(request, riskAssessment);
      if (agentApprovalRequired) {
        return {
          required: true,
          approvers: ['agent-supervisor', 'security-admin'],
          reason: 'Agent operation requires additional approval',
          estimatedTime: '15-30 minutes'
        };
      }
    }

    // Additional approval for high-risk OAuth operations
    if (request.securityContext.oauthProvider && riskAssessment.overallRisk >= RiskLevel.HIGH) {
      return {
        required: true,
        approvers: ['oauth-admin', 'security-admin'],
        reason: 'High-risk OAuth operation requires approval',
        estimatedTime: '30-60 minutes'
      };
    }

    return baseRequirement;
  }

  /**
   * Check MFA requirements based on enhanced context
   */
  private async checkMFARequirement(
    request: EnhancedSecurityValidationRequest,
    riskAssessment: RiskAssessment
  ): Promise<{ required: boolean; methods?: MFAMethod[] }> {
    // Always require MFA for critical operations
    if (riskAssessment.level === SecurityLevel.CRITICAL) {
      return {
        required: true,
        methods: [MFAMethod.TOTP, MFAMethod.PUSH, MFAMethod.HARDWARE_TOKEN]
      };
    }

    // Require MFA for high-risk operations if not already verified
    if (riskAssessment.level === SecurityLevel.HIGH && !request.securityContext.mfaVerified) {
      return {
        required: true,
        methods: [MFAMethod.TOTP, MFAMethod.SMS, MFAMethod.EMAIL]
      };
    }

    // Require MFA for agent operations with sensitive capabilities
    if (request.securityContext.userType === UserType.AGENT) {
      const sensitiveCapabilities = [
        AgentCapability.CODE_REPOSITORY,
        AgentCapability.EMAIL_ACCESS,
        AgentCapability.FILE_MANAGEMENT
      ];

      const hasSensitiveCapability = request.securityContext.agentCapabilities?.some(
        cap => sensitiveCapabilities.includes(cap)
      );

      if (hasSensitiveCapability && !request.securityContext.mfaVerified) {
        return {
          required: true,
          methods: [MFAMethod.TOTP, MFAMethod.PUSH]
        };
      }
    }

    return { required: false };
  }

  /**
   * Get agent-specific restrictions
   */
  private async getAgentRestrictions(
    request: EnhancedSecurityValidationRequest
  ): Promise<any> {
    if (request.securityContext.userType !== UserType.AGENT) {
      return undefined;
    }

    const restrictions: any = {
      monitoring: {
        logLevel: 'detailed',
        alertThresholds: {
          dailyOperations: 100,
          hourlyOperations: 20,
          errorRate: 0.05
        }
      }
    };

    // Add rate limiting based on agent capabilities
    if (request.securityContext.agentCapabilities) {
      const highRiskCapabilities = [
        AgentCapability.CODE_REPOSITORY,
        AgentCapability.EMAIL_ACCESS,
        AgentCapability.FILE_MANAGEMENT
      ];

      const hasHighRiskCapability = request.securityContext.agentCapabilities.some(
        cap => highRiskCapabilities.includes(cap)
      );

      if (hasHighRiskCapability) {
        restrictions.rateLimit = {
          requests: 50,
          windowMs: 60 * 60 * 1000 // 1 hour
        };
      }
    }

    return restrictions;
  }

  // Helper methods for risk assessment

  private assessUserTypeRisk(userType: UserType): RiskFactor {
    const riskMap = {
      [UserType.HUMAN]: { score: 1, level: RiskLevel.LOW },
      [UserType.AGENT]: { score: 3, level: RiskLevel.MEDIUM },
      [UserType.SERVICE]: { score: 2, level: RiskLevel.LOW },
      [UserType.SYSTEM]: { score: 4, level: RiskLevel.HIGH }
    };

    const risk = riskMap[userType];
    return {
      type: 'user_type',
      level: risk.level,
      description: `User type: ${userType}`,
      score: risk.score,
      mitigations: userType === UserType.AGENT ? ['Enhanced monitoring', 'Capability validation'] : []
    };
  }

  private assessAuthMethodRisk(authMethod: AuthenticationMethod): RiskFactor {
    const riskMap = {
      [AuthenticationMethod.PASSWORD]: { score: 3, level: RiskLevel.MEDIUM },
      [AuthenticationMethod.OAUTH]: { score: 2, level: RiskLevel.LOW },
      [AuthenticationMethod.SAML]: { score: 1, level: RiskLevel.LOW },
      [AuthenticationMethod.LDAP]: { score: 2, level: RiskLevel.LOW },
      [AuthenticationMethod.API_KEY]: { score: 4, level: RiskLevel.HIGH },
      [AuthenticationMethod.CERTIFICATE]: { score: 1, level: RiskLevel.LOW },
      [AuthenticationMethod.BIOMETRIC]: { score: 1, level: RiskLevel.LOW },
      [AuthenticationMethod.AGENT_TOKEN]: { score: 3, level: RiskLevel.MEDIUM }
    };

    const risk = riskMap[authMethod];
    return {
      type: 'authentication_method',
      level: risk.level,
      description: `Authentication method: ${authMethod}`,
      score: risk.score,
      mitigations: risk.score > 2 ? ['MFA verification', 'Token rotation'] : []
    };
  }

  private assessOAuthProviderRisk(provider: OAuthProviderType): RiskFactor {
    const riskMap = {
      [OAuthProviderType.GITHUB]: { score: 2, level: RiskLevel.MEDIUM },
      [OAuthProviderType.GOOGLE]: { score: 1, level: RiskLevel.LOW },
      [OAuthProviderType.GMAIL]: { score: 2, level: RiskLevel.MEDIUM },
      [OAuthProviderType.MICROSOFT]: { score: 1, level: RiskLevel.LOW },
      [OAuthProviderType.OUTLOOK]: { score: 2, level: RiskLevel.MEDIUM },
      [OAuthProviderType.ZOHO]: { score: 2, level: RiskLevel.MEDIUM },
      [OAuthProviderType.ZOHO_MAIL]: { score: 2, level: RiskLevel.MEDIUM },
      [OAuthProviderType.LINKEDIN]: { score: 1, level: RiskLevel.LOW },
      [OAuthProviderType.SLACK]: { score: 2, level: RiskLevel.MEDIUM },
      [OAuthProviderType.DISCORD]: { score: 3, level: RiskLevel.MEDIUM },
      [OAuthProviderType.CUSTOM]: { score: 4, level: RiskLevel.HIGH }
    };

    const risk = riskMap[provider];
    return {
      type: 'oauth_provider',
      level: risk.level,
      description: `OAuth provider: ${provider}`,
      score: risk.score,
      mitigations: ['Token validation', 'Scope verification']
    };
  }

  private assessAgentCapabilityRisk(capabilities: AgentCapability[]): RiskFactor {
    const capabilityRiskScores = {
      [AgentCapability.CODE_REPOSITORY]: 4,
      [AgentCapability.EMAIL_ACCESS]: 3,
      [AgentCapability.NOTE_TAKING]: 1,
      [AgentCapability.FILE_MANAGEMENT]: 3,
      [AgentCapability.COMMUNICATION]: 2,
      [AgentCapability.DATA_ANALYSIS]: 2,
      [AgentCapability.TASK_AUTOMATION]: 3,
      [AgentCapability.CONTENT_CREATION]: 1,
      [AgentCapability.INTEGRATION]: 3,
      [AgentCapability.MONITORING]: 2
    };

    const totalScore = capabilities.reduce((sum, cap) => sum + capabilityRiskScores[cap], 0);
    const averageScore = totalScore / capabilities.length;
    const level = this.scoreToRiskLevel(averageScore);

    return {
      type: 'agent_capabilities',
      level,
      description: `Agent capabilities: ${capabilities.join(', ')}`,
      score: Math.min(averageScore, 5), // Cap at 5
      mitigations: ['Capability validation', 'Operation monitoring', 'Rate limiting']
    };
  }

  private requiresAgentApproval(
    request: EnhancedSecurityValidationRequest,
    riskAssessment: RiskAssessment
  ): boolean {
    // Require approval for critical operations
    if (riskAssessment.level === SecurityLevel.CRITICAL) {
      return true;
    }

    // Require approval for sensitive capabilities
    const sensitiveCapabilities = [
      AgentCapability.CODE_REPOSITORY,
      AgentCapability.EMAIL_ACCESS,
      AgentCapability.FILE_MANAGEMENT
    ];

    const hasSensitiveCapability = request.securityContext.agentCapabilities?.some(
      cap => sensitiveCapabilities.includes(cap)
    );

    if (hasSensitiveCapability && riskAssessment.level >= SecurityLevel.HIGH) {
      return true;
    }

    return false;
  }

  private getRequiredCapabilityForOperation(operationType: string): AgentCapability | undefined {
    const operationCapabilityMap: Record<string, AgentCapability> = {
      'git_clone': AgentCapability.CODE_REPOSITORY,
      'git_push': AgentCapability.CODE_REPOSITORY,
      'git_pull': AgentCapability.CODE_REPOSITORY,
      'repo_create': AgentCapability.CODE_REPOSITORY,
      'email_read': AgentCapability.EMAIL_ACCESS,
      'email_send': AgentCapability.EMAIL_ACCESS,
      'email_search': AgentCapability.EMAIL_ACCESS,
      'file_read': AgentCapability.FILE_MANAGEMENT,
      'file_write': AgentCapability.FILE_MANAGEMENT,
      'file_delete': AgentCapability.FILE_MANAGEMENT,
      'note_create': AgentCapability.NOTE_TAKING,
      'note_update': AgentCapability.NOTE_TAKING,
      'audio_process': AgentCapability.NOTE_TAKING,
      'video_process': AgentCapability.NOTE_TAKING
    };

    return operationCapabilityMap[operationType];
  }

  private generateRecommendations(factors: RiskFactor[]): string[] {
    const recommendations: string[] = [];

    factors.forEach(factor => {
      if (factor.level >= RiskLevel.HIGH) {
        recommendations.push(`Address high-risk factor: ${factor.description}`);
      }
      if (factor.mitigations) {
        recommendations.push(...factor.mitigations);
      }
    });

    return [...new Set(recommendations)]; // Remove duplicates
  }

  private generateMitigations(factors: RiskFactor[]): string[] {
    const mitigations: string[] = [];

    factors.forEach(factor => {
      if (factor.mitigations) {
        mitigations.push(...factor.mitigations);
      }
    });

    return [...new Set(mitigations)]; // Remove duplicates
  }

  private generateReasoning(
    request: EnhancedSecurityValidationRequest,
    riskAssessment: RiskAssessment,
    approvalRequirement: ApprovalRequirement
  ): string {
    const parts: string[] = [];

    parts.push(`Risk assessment: ${riskAssessment.level} (score: ${riskAssessment.score.toFixed(2)})`);

    if (request.securityContext.userType === UserType.AGENT) {
      parts.push(`Agent operation with capabilities: ${request.securityContext.agentCapabilities?.join(', ')}`);
    }

    if (request.securityContext.oauthProvider) {
      parts.push(`OAuth provider: ${request.securityContext.oauthProvider}`);
    }

    if (approvalRequirement.required) {
      parts.push(`Approval required: ${approvalRequirement.reason}`);
    }

    return parts.join('. ');
  }

  private loadAgentSecurityPolicies(): void {
    // Load agent-specific security policies from database
    // This would typically load from a configuration or database
    const defaultAgentPolicies: AgentSecurityPolicy[] = [
      {
        id: 'agent-code-access',
        name: 'Agent Code Repository Access',
        description: 'Controls agent access to code repositories',
        applicableCapabilities: [AgentCapability.CODE_REPOSITORY],
        allowedProviders: [OAuthProviderType.GITHUB],
        conditions: {
          maxDailyCommits: 50,
          allowedRepositories: ['public', 'approved-private']
        },
        actions: {
          allow: true,
          rateLimits: {
            requestsPerHour: 100,
            requestsPerDay: 1000
          }
        },
        priority: 10,
        isActive: true
      },
      {
        id: 'agent-email-access',
        name: 'Agent Email Access',
        description: 'Controls agent access to email systems',
        applicableCapabilities: [AgentCapability.EMAIL_ACCESS],
        allowedProviders: [OAuthProviderType.GMAIL, OAuthProviderType.OUTLOOK],
        conditions: {
          maxDailyEmails: 100,
          restrictedFolders: ['deleted', 'spam']
        },
        actions: {
          allow: true,
          rateLimits: {
            requestsPerHour: 50,
            requestsPerDay: 500
          }
        },
        priority: 8,
        isActive: true
      }
    ];

    defaultAgentPolicies.forEach(policy => {
      this.agentPolicies.set(policy.id, policy);
    });

    logger.info('Agent security policies loaded', { count: this.agentPolicies.size });
  }

  private isAgentPolicyApplicable(
    policy: AgentSecurityPolicy,
    request: EnhancedSecurityValidationRequest
  ): boolean {
    const agentCapabilities = request.securityContext.agentCapabilities || [];
    const hasApplicableCapability = policy.applicableCapabilities.some(cap =>
      agentCapabilities.includes(cap)
    );

    if (!hasApplicableCapability) return false;

    if (request.securityContext.oauthProvider &&
      !policy.allowedProviders.includes(request.securityContext.oauthProvider)) {
      return false;
    }

    return true;
  }

  private async checkAgentRateLimits(
    agentId: string,
    rateLimits: { requestsPerHour: number; requestsPerDay: number }
  ): Promise<void> {
    // Check current usage against rate limits
    // This would typically query a rate limiting service or database
    const currentHourlyUsage = await this.databaseService.getAgentHourlyUsage(agentId);
    const currentDailyUsage = await this.databaseService.getAgentDailyUsage(agentId);

    if (currentHourlyUsage >= rateLimits.requestsPerHour) {
      throw new ApiError(429, 'Hourly rate limit exceeded', 'HOURLY_RATE_LIMIT_EXCEEDED');
    }

    if (currentDailyUsage >= rateLimits.requestsPerDay) {
      throw new ApiError(429, 'Daily rate limit exceeded', 'DAILY_RATE_LIMIT_EXCEEDED');
    }
  }

  // Override parent methods to add enhanced functionality

  private applyEnhancedSecurityPolicies(
    request: EnhancedSecurityValidationRequest,
    riskAssessment: RiskAssessment
  ): Promise<{ allowed: boolean; conditions: string[]; appliedPolicies: string[] }> {
    // Apply both regular and agent-specific policies
    // This would combine the results from both policy sets
    return this.applySecurityPolicies({
      operation: request.operation,
      securityContext: {
        userId: request.securityContext.userId,
        sessionId: request.securityContext.sessionId,
        ipAddress: request.securityContext.ipAddress,
        userAgent: request.securityContext.userAgent,
        department: request.securityContext.department,
        role: request.securityContext.role,
        permissions: request.securityContext.permissions,
        securityLevel: request.securityContext.securityLevel,
        lastAuthentication: request.securityContext.lastAuthentication,
        mfaVerified: request.securityContext.mfaVerified,
        riskScore: request.securityContext.riskScore
      }
    }, riskAssessment);
  }

  private determineEnhancedApprovalRequirement(
    request: EnhancedSecurityValidationRequest,
    riskAssessment: RiskAssessment,
    policyResult: { allowed: boolean; conditions: string[]; appliedPolicies: string[] }
  ): boolean {
    // Enhanced approval logic for agents and OAuth operations
    const baseRequirement = this.determineApprovalRequirement({
      operation: request.operation,
      securityContext: {
        userId: request.securityContext.userId,
        sessionId: request.securityContext.sessionId,
        ipAddress: request.securityContext.ipAddress,
        userAgent: request.securityContext.userAgent,
        department: request.securityContext.department,
        role: request.securityContext.role,
        permissions: request.securityContext.permissions,
        securityLevel: request.securityContext.securityLevel,
        lastAuthentication: request.securityContext.lastAuthentication,
        mfaVerified: request.securityContext.mfaVerified,
        riskScore: request.securityContext.riskScore
      }
    }, riskAssessment, policyResult);

    // Additional approval requirements for agents
    if (request.securityContext.userType === UserType.AGENT) {
      const sensitiveCapabilities = [
        AgentCapability.CODE_REPOSITORY,
        AgentCapability.EMAIL_ACCESS
      ];

      const hasSensitiveCapability = request.securityContext.agentCapabilities?.some(cap =>
        sensitiveCapabilities.includes(cap)
      );

      if (hasSensitiveCapability && riskAssessment.overallRisk >= RiskLevel.HIGH) {
        return true;
      }
    }

    return baseRequirement;
  }

  private async getEnhancedRequiredApprovers(
    request: EnhancedSecurityValidationRequest,
    riskAssessment: RiskAssessment
  ): Promise<string[]> {
    const baseApprovers = await this.getRequiredApprovers({
      operation: request.operation,
      securityContext: {
        userId: request.securityContext.userId,
        sessionId: request.securityContext.sessionId,
        ipAddress: request.securityContext.ipAddress,
        userAgent: request.securityContext.userAgent,
        department: request.securityContext.department,
        role: request.securityContext.role,
        permissions: request.securityContext.permissions,
        securityLevel: request.securityContext.securityLevel,
        lastAuthentication: request.securityContext.lastAuthentication,
        mfaVerified: request.securityContext.mfaVerified,
        riskScore: request.securityContext.riskScore
      }
    }, riskAssessment);

    const enhancedApprovers = [...baseApprovers];

    // Add agent-specific approvers
    if (request.securityContext.userType === UserType.AGENT) {
      enhancedApprovers.push('agent-supervisor');

      if (request.securityContext.agentCapabilities?.includes(AgentCapability.CODE_REPOSITORY)) {
        enhancedApprovers.push('code-review-team');
      }
    }

    return [...new Set(enhancedApprovers)]; // Remove duplicates
  }

  private buildEnhancedReasoningText(
    request: EnhancedSecurityValidationRequest,
    riskAssessment: RiskAssessment,
    policyResult: any,
    approvalRequired: boolean
  ): string {
    const baseReasoning = this.buildReasoningText({
      operation: request.operation,
      securityContext: {
        userId: request.securityContext.userId,
        sessionId: request.securityContext.sessionId,
        ipAddress: request.securityContext.ipAddress,
        userAgent: request.securityContext.userAgent,
        department: request.securityContext.department,
        role: request.securityContext.role,
        permissions: request.securityContext.permissions,
        securityLevel: request.securityContext.securityLevel,
        lastAuthentication: request.securityContext.lastAuthentication,
        mfaVerified: request.securityContext.mfaVerified,
        riskScore: request.securityContext.riskScore
      }
    }, riskAssessment, policyResult, approvalRequired);

    const enhancedReasons: string[] = [baseReasoning];

    if (request.securityContext.userType === UserType.AGENT) {
      enhancedReasons.push(`Agent operation with ${request.securityContext.agentCapabilities?.length || 0} capabilities`);
    }

    if (request.securityContext.oauthProvider) {
      enhancedReasons.push(`OAuth provider: ${request.securityContext.oauthProvider}`);
    }

    if (!request.securityContext.deviceTrusted) {
      enhancedReasons.push('Untrusted device detected');
    }

    return enhancedReasons.join('. ');
  }

  private calculateEnhancedValidityPeriod(
    riskAssessment: RiskAssessment,
    securityContext: EnhancedSecurityContext
  ): Date {
    let validityMinutes = 60; // Default 1 hour

    // Adjust based on risk level
    switch (riskAssessment.overallRisk) {
      case RiskLevel.LOW:
        validityMinutes = 240; // 4 hours
        break;
      case RiskLevel.MEDIUM:
        validityMinutes = 120; // 2 hours
        break;
      case RiskLevel.HIGH:
        validityMinutes = 30; // 30 minutes
        break;
      case RiskLevel.CRITICAL:
        validityMinutes = 15; // 15 minutes
        break;
    }

    // Adjust for user type
    if (securityContext.userType === UserType.AGENT) {
      validityMinutes = Math.min(validityMinutes, 60); // Max 1 hour for agents
    }

    // Adjust for authentication method
    if (securityContext.authenticationMethod === AuthenticationMethod.AGENT_TOKEN) {
      validityMinutes = Math.min(validityMinutes, 30); // Max 30 minutes for agent tokens
    }

    return new Date(Date.now() + validityMinutes * 60 * 1000);
  }
} 