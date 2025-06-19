import { DatabaseService } from './databaseService.js';
import { logger, ApiError } from '@uaip/utils';
import {
  SecurityValidationResult,
  RiskAssessment,
  RiskFactor,
  RiskLevel,
  SecurityContext,
  ApprovalWorkflow,
  Agent,
  ExecutionPlan,
  SecurityLevel
} from '@uaip/types';

export class SecurityValidationService {
  private databaseService: DatabaseService;
  private isInitialized: boolean = false;

  constructor() {
    this.databaseService = new DatabaseService();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.databaseService.initialize();
      this.isInitialized = true;
    }
  }

  public async validateOperation(
    securityContext: SecurityContext,
    operation: string,
    resources: string[],
    operationData: any
  ): Promise<SecurityValidationResult> {
    await this.ensureInitialized();
    
    try {
      logger.info('Validating operation security', { 
        userId: securityContext.userId,
        operation: operation,
      });

      // Step 1: Validate user authentication and authorization
      const authValidation = await this.validateUserAuth(securityContext.userId);
      if (!authValidation.valid) {
        return {
          allowed: false,
          riskLevel: SecurityLevel.HIGH,
          approvalRequired: false,
          conditions: [],
          reasoning: 'User authentication failed'
        };
      }

      // Step 2: Check user permissions for the operation
      const permissions = await this.getUserPermissions(
        securityContext.userId,
        operation,
        resources
      );

      if (!permissions.hasPermission) {
        return {
          allowed: false,
          riskLevel: SecurityLevel.HIGH,
          approvalRequired: false,
          conditions: [],
          reasoning: 'Insufficient permissions'
        };
      }

      // Step 3: Assess operation risk
      const riskAssessment = await this.assessOperationRisk(
        securityContext,
        operation,
        resources,
        operationData
      );

      // Step 4: Determine if approval is required
      const approvalRequired = await this.isApprovalRequired(
        riskAssessment,
        securityContext,
        operation,
        operationData
      );

      // Step 5: Apply security conditions
      const conditions = await this.generateSecurityConditions(
        riskAssessment,
        securityContext,
        operation,
        operationData
      );

      return {
        allowed: true,
        riskLevel: riskAssessment.level || SecurityLevel.MEDIUM,
        approvalRequired,
        conditions,
        reasoning: riskAssessment.factors?.join('; ') || 'No specific risk factors identified'
      };

    } catch (error) {
      logger.error('Error validating operation security', { 
        securityContext, 
        error: (error as Error).message 
      });
      throw new ApiError(500, 'Security validation failed', 'SECURITY_ERROR');
    }
  }

  public async assessRisk(
    plan: ExecutionPlan,
    agentSecurityContext: any
  ): Promise<RiskAssessment> {
    await this.ensureInitialized();
    
    try {
      logger.info('Assessing execution plan risk', { planId: plan.id });

      const riskFactors: RiskFactor[] = [];

      // Assess plan complexity risk
      const complexityRisk = this.assessComplexityRisk(plan);
      if (complexityRisk.level !== RiskLevel.LOW) {
        riskFactors.push(complexityRisk);
      }

      // Assess duration risk
      const durationRisk = this.assessDurationRisk(plan);
      if (durationRisk.level !== RiskLevel.LOW) {
        riskFactors.push(durationRisk);
      }

      // Assess resource risk
      const resourceRisk = this.assessResourceRisk(plan);
      if (resourceRisk.level !== RiskLevel.LOW) {
        riskFactors.push(resourceRisk);
      }

      // Assess agent security context risk
      const agentRisk = this.assessAgentRisk(plan, agentSecurityContext);
      if (agentRisk.level !== RiskLevel.LOW) {
        riskFactors.push(agentRisk);
      }

      // Calculate overall risk level
      const overallRisk = this.calculateOverallRisk(riskFactors);

      // Determine if approval is required
      const requiresApproval = overallRisk === RiskLevel.HIGH || 
        riskFactors.some((f: RiskFactor) => f.type === 'security_sensitive');

      // Generate mitigation recommendations
      const recommendedMitigations = this.generateMitigations(riskFactors, plan);

      return {
        level: this.convertRiskLevelToSecurityLevel(overallRisk),
        overallRisk,
        score: this.calculateRiskScore(riskFactors),
        factors: riskFactors,
        recommendations: recommendedMitigations,
        mitigations: recommendedMitigations,
        assessedAt: new Date(),
        assessedBy: 'system'
      };

    } catch (error) {
      logger.error('Error assessing plan risk', { planId: plan.id, error: (error as Error).message });
      throw new ApiError(500, 'Risk assessment failed', 'RISK_ASSESSMENT_ERROR');
    }
  }

  public async filterSensitiveData(
    data: any,
    userId: string,
    operation: 'read' | 'write' | 'delete'
  ): Promise<any> {
    await this.ensureInitialized();
    
    try {
      // Get user's data access level
      const accessLevel = await this.getUserDataAccessLevel(userId);

      // Clone the data to avoid modifying the original
      const filteredData = JSON.parse(JSON.stringify(data));

      // Apply filtering based on access level
      switch (accessLevel) {
        case 'admin':
          // Admin can see everything
          return filteredData;
          
        case 'operator':
          // Remove highly sensitive fields
          if (filteredData.security_context) {
            delete filteredData.security_context.api_keys;
            delete filteredData.security_context.credentials;
          }
          break;
          
        case 'viewer':
          // Remove all sensitive fields
          delete filteredData.security_context;
          if (filteredData.intelligence_config) {
            delete filteredData.intelligence_config.internal_params;
          }
          break;
          
        default:
          throw new ApiError(403, 'Access denied', 'ACCESS_DENIED');
      }

      return filteredData;
    } catch (error) {
      logger.error('Error filtering sensitive data', { userId, operation, error: (error as Error).message });
      throw error;
    }
  }

  public async createApprovalWorkflow(
    operationId: string,
    approvers: string[],
    context: any  
  ): Promise<string> {
    await this.ensureInitialized();
    
    try {
      const workflowId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await this.databaseService.createApprovalWorkflow({
        id: workflowId,
        operationId,
        requiredApprovers: approvers,
        status: 'pending',
        metadata: context
      });

      logger.info('Approval workflow created', { workflowId, operationId, approvers });
      return workflowId;
    } catch (error) {
      logger.error('Error creating approval workflow', { operationId, error: (error as Error).message });
      throw new ApiError(500, 'Failed to create approval workflow', 'WORKFLOW_ERROR');
    }
  }

  // Private helper methods

  private async validateUserAuth(userId: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      const user = await this.databaseService.getUserAuthDetails(userId);
      
      if (!user) {
        return { valid: false, reason: 'User not found' };
      }

      if (!user.isActive) {
        return { valid: false, reason: 'User account disabled' };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Error validating user auth', { userId, error: (error as Error).message });
      return { valid: false, reason: 'Authentication error' };
    }
  }

  private async getUserPermissions(
    userId: string,
    operation: string,
    resources: string[]
  ): Promise<{
    hasPermission: boolean;
    granted: string[];
    required: string[];
  }> {
    try {
      const permissions = await this.databaseService.getUserPermissions(userId);
      
      const userPermissions = new Set<string>();
      
      // Process role-based permissions
      permissions.rolePermissions.forEach(rolePermission => {
        if (rolePermission.operations) {
          rolePermission.operations.forEach((op: string) => userPermissions.add(op));
        }
      });

      // Process direct permissions
      permissions.directPermissions.forEach(directPermission => {
        if (directPermission.operations) {
          directPermission.operations.forEach((op: string) => userPermissions.add(op));
        }
      });

      // Check if user has permission for the specific operation
      const hasPermission = userPermissions.has(operation) || 
                          userPermissions.has('*') ||
                          userPermissions.has(`${operation}:*`);

      return {
        hasPermission,
        granted: Array.from(userPermissions),
        required: [operation]
      };
    } catch (error) {
      logger.error('Error getting user permissions', { userId, operation, error: (error as Error).message });
      return { hasPermission: false, granted: [], required: [operation] };
    }
  }

  private async assessOperationRisk(
    securityContext: SecurityContext,
    operation: string,
    resources: string[],
    operationData: any
  ): Promise<RiskAssessment> {
    const riskFactors: RiskFactor[] = [];

    // Assess user risk level
    const userRisk = await this.assessUserRisk(securityContext.userId);
    if (userRisk.level !== RiskLevel.LOW) {
      riskFactors.push(userRisk);
    }

    // Assess operation type risk
    const operationRisk = this.assessOperationTypeRisk(operation);
    if (operationRisk.level !== RiskLevel.LOW) {
      riskFactors.push(operationRisk);
    }

    // Assess data sensitivity risk
    const dataRisk = this.assessDataSensitivityRisk(operationData);
    if (dataRisk.level !== RiskLevel.LOW) {
      riskFactors.push(dataRisk);
    }

    const overallRisk = this.calculateOverallRisk(riskFactors);

    return {
      level: this.convertRiskLevelToSecurityLevel(overallRisk),
      overallRisk,
      score: this.calculateRiskScore(riskFactors),
      factors: riskFactors,
      recommendations: [],
      mitigations: [],
      assessedAt: new Date(),
      assessedBy: 'system'
    };
  }

  private async assessUserRisk(userId: string): Promise<RiskFactor> {
    try {
      // Use DatabaseService getUserRiskData method instead of raw SQL
      const userData = await this.databaseService.getUserRiskData(userId);
      
      if (!userData) {
        return {
          type: 'user_verification',
          level: RiskLevel.HIGH,
          score: 8,
          description: 'User not found in system'
        };
      }

      // High activity in last 24 hours might indicate compromised account
      if (userData.recentActivityCount > 100) {
        return {
          type: 'user_behavior',
          level: RiskLevel.MEDIUM,
          score: 6,
          description: 'Unusually high activity detected'
        };
      }

      return {
        type: 'user_verification',
        level: RiskLevel.LOW,
        score: 2,
        description: 'User verification passed'
      };
    } catch (error) {
      return {
        type: 'user_verification',
        level: RiskLevel.MEDIUM,
        score: 5,
        description: 'Could not verify user risk level'
      };
    }
  }

  private assessOperationTypeRisk(operation: string): RiskFactor {
    const highRiskOperations = [
      'delete_agent',
      'modify_security_context',
      'execute_privileged_operation',
      'access_external_systems'
    ];

    const mediumRiskOperations = [
      'update_agent',
      'create_operation',
      'modify_permissions'
    ];

    if (highRiskOperations.includes(operation)) {
      return {
        type: 'operation_type',
        level: RiskLevel.HIGH,
        score: 8,
        description: `High-risk operation: ${operation}`
      };
    }

    if (mediumRiskOperations.includes(operation)) {
      return {
        type: 'operation_type',
        level: RiskLevel.MEDIUM,
        score: 5,
        description: `Medium-risk operation: ${operation}`
      };
    }

    return {
      type: 'operation_type',
      level: RiskLevel.LOW,
      score: 2,
      description: 'Standard operation'
    };
  }

  private assessDataSensitivityRisk(operationData: any): RiskFactor {
    // Look for sensitive data patterns
    const sensitivePatterns = [
      /api[_-]?key/i,
      /password/i,
      /secret/i,
      /credential/i,
      /token/i,
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card pattern
      /\b\d{3}-\d{2}-\d{4}\b/ // SSN pattern
    ];

    const dataString = JSON.stringify(operationData);
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(dataString)) {
        return {
          type: 'data_sensitivity',
          level: RiskLevel.HIGH,
          score: 9,
          description: 'Sensitive data detected in operation'
        };
      }
    }

    return {
      type: 'data_sensitivity',
      level: RiskLevel.LOW,
      score: 1,
      description: 'No sensitive data detected'
    };
  }

  private assessComplexityRisk(plan: ExecutionPlan): RiskFactor {
    const stepCount = plan.steps?.length;
    const duration = plan.estimatedDuration;

    if (stepCount > 10 || (duration && duration > 3600)) { // More than 10 steps or 1 hour
      return {
        type: 'complexity',
        level: RiskLevel.HIGH,
        score: 8,
        description: 'High complexity operation with many steps or long duration'
      };
    }

    if (stepCount > 5 || (duration && duration > 1800)) { // More than 5 steps or 30 minutes
      return {
        type: 'complexity',
        level: RiskLevel.MEDIUM,
        score: 5,
        description: 'Medium complexity operation'
      };
    }

    return {
      type: 'complexity',
      level: RiskLevel.LOW,
      score: 2,
      description: 'Low complexity operation'
    };
  }

  private assessDurationRisk(plan: ExecutionPlan): RiskFactor {
    const duration = plan.estimatedDuration;

    if (duration && duration > 7200) { // More than 2 hours
      return {
        type: 'duration',
        level: RiskLevel.HIGH,
        score: 7,
        description: 'Very long running operation'
      };
    }

    if (duration && duration > 3600) { // More than 1 hour
      return {
        type: 'duration',
        level: RiskLevel.MEDIUM,
        score: 4,
        description: 'Long running operation'
      };
    }

    return {
      type: 'duration',
      level: RiskLevel.LOW,
      score: 1,
      description: 'Short duration operation'
    };
  }

  private assessResourceRisk(plan: ExecutionPlan): RiskFactor {
    // Check if plan involves resource-intensive operations
    const resourceIntensiveTypes = ['data_processing', 'ml_training', 'bulk_operations'];
    
    if (plan.type && resourceIntensiveTypes.includes(plan.type)) {
      return {
        type: 'resource',
        level: RiskLevel.MEDIUM,
        score: 5,
        description: 'Resource-intensive operation type'
      };
    }

    return {
      type: 'resource',
      level: RiskLevel.LOW,
      score: 2,
      description: 'Standard resource usage'
    };
  }

  private assessAgentRisk(plan: ExecutionPlan, agentSecurityContext: any): RiskFactor {
    const securityLevel = agentSecurityContext?.securityLevel || 'medium';
    
    if (securityLevel === 'high' && plan.type !== 'information_retrieval') {
      return {
        type: 'agent_security',
        level: RiskLevel.MEDIUM,
        score: 5,
        description: 'High-security agent performing operational tasks'
      };
    }

    return {
      type: 'agent_security',
      level: RiskLevel.LOW,
      score: 2,
      description: 'Agent security level appropriate for operation'
    };
  }

  private calculateOverallRisk(riskFactors: RiskFactor[]): RiskLevel {
    if (riskFactors.some(f => f.level === RiskLevel.HIGH)) {
      return RiskLevel.HIGH;
    }
    
    if (riskFactors.filter(f => f.level === RiskLevel.MEDIUM).length >= 2) {
      return RiskLevel.HIGH;
    }
    
    if (riskFactors.some(f => f.level === RiskLevel.MEDIUM)) {
      return RiskLevel.MEDIUM;
    }
    
    return RiskLevel.LOW;
  }

  private calculateRiskScore(riskFactors: RiskFactor[]): number {
    const totalScore = riskFactors.reduce((sum, factor) => sum + (factor.score), 0);
    return Math.min(totalScore, 100); // Cap at 100
  }

  private async isApprovalRequired(
    riskAssessment: RiskAssessment,
    securityContext: SecurityContext,
    operation: string,
    operationData: any
  ): Promise<boolean> {
    // High risk operations always require approval
    if (riskAssessment.level === SecurityLevel.HIGH) {
      return true;
    }

    // Check if operation type requires approval
    const approvalRequiredOperations = [
      'delete_agent',
      'modify_security',
      'external_api_call',
      'data_export'
    ];

    if (approvalRequiredOperations.includes(operation)) {
      return true;
    }

    // Medium risk operations require approval for non-admin users
    if (riskAssessment.level === SecurityLevel.MEDIUM) {
      return securityContext.securityLevel !== SecurityLevel.HIGH;
    }

    // Add operation-specific approval logic
    if (operation.includes('external')) {
      return true;
    }

    return false;
  }

  private async generateSecurityConditions(
    riskAssessment: RiskAssessment,
    securityContext: SecurityContext,
    operation: string,
    operationData: any
  ): Promise<string[]> {
    const conditions = [];

    if (riskAssessment.level === SecurityLevel.HIGH) {
      conditions.push('Enhanced monitoring required');
      conditions.push('Automatic rollback on failure');
    }

    if (riskAssessment.level === SecurityLevel.MEDIUM) {
      conditions.push('Standard monitoring required');
    }

    // Add operation-specific conditions
    if (operation.includes('external')) {
      conditions.push('Network activity logging required');
    }

    return conditions;
  }

  private generateMitigations(riskFactors: RiskFactor[], plan: ExecutionPlan): string[] {
    const mitigations: string[] = [];

    riskFactors.forEach(factor => {
      switch (factor.type) {
        case 'complexity':
          mitigations.push('Break down into smaller operations');
          break;
        case 'duration':
          mitigations.push('Implement progress checkpoints');
          break;
        case 'resource_usage':
          mitigations.push('Monitor resource consumption');
          break;
        case 'data_sensitivity':
          mitigations.push('Encrypt sensitive data in transit');
          break;
      }
    });

    return [...new Set(mitigations)]; // Remove duplicates
  }

  private async getUserDataAccessLevel(userId: string): Promise<string> {
    try {
      // Use DatabaseService getUserHighestRole method instead of raw SQL
      const roleName = await this.databaseService.getUserHighestRole(userId);
      
      if (roleName) {
        return roleName;
      }

      return 'viewer'; // Default to most restrictive
    } catch (error) {
      logger.error('Error getting user data access level', { userId, error: (error as Error).message });
      return 'viewer'; // Default to most restrictive on error
    }
  }

  private convertRiskLevelToSecurityLevel(riskLevel: RiskLevel): SecurityLevel {
    switch (riskLevel) {
      case RiskLevel.LOW:
        return SecurityLevel.LOW;
      case RiskLevel.MEDIUM:
        return SecurityLevel.MEDIUM;
      case RiskLevel.HIGH:
        return SecurityLevel.HIGH;
      default:
        throw new Error('Invalid risk level');
    }
  }
} 
