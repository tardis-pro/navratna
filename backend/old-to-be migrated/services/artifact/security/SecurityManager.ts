// Security Manager - Handles authentication, authorization, and security auditing
// Epic 4 Implementation

import { SecurityManager, SecurityEvent } from '../interfaces';

export class SecurityManagerImpl implements SecurityManager {
  private userPermissions: Map<string, string[]> = new Map();
  private auditLogs: SecurityEvent[] = [];
  private credentialValidators: Map<string, () => Promise<boolean>> = new Map();

  constructor() {
    this.initializeDefaultPermissions();
  }

  /**
   * Validate user access for operation
   */
  async validateAccess(userId: string, operation: string, resource: string): Promise<boolean> {
    try {
      const userPerms = await this.getUserPermissions(userId);
      
      // Check for specific permission
      const specificPermission = `${operation}:${resource}`;
      if (userPerms.includes(specificPermission)) {
        await this.auditLog({
          type: 'access_granted',
          userId,
          resource,
          operation,
          timestamp: new Date().toISOString(),
          metadata: { permission: specificPermission }
        });
        return true;
      }

      // Check for wildcard permissions
      const wildcardPermission = `${operation}:*`;
      if (userPerms.includes(wildcardPermission)) {
        await this.auditLog({
          type: 'access_granted',
          userId,
          resource,
          operation,
          timestamp: new Date().toISOString(),
          metadata: { permission: wildcardPermission }
        });
        return true;
      }

      // Check for admin permission
      if (userPerms.includes('admin:*')) {
        await this.auditLog({
          type: 'access_granted',
          userId,
          resource,
          operation,
          timestamp: new Date().toISOString(),
          metadata: { permission: 'admin:*' }
        });
        return true;
      }

      // Access denied
      await this.auditLog({
        type: 'access_denied',
        userId,
        resource,
        operation,
        timestamp: new Date().toISOString(),
        metadata: { reason: 'insufficient_permissions' }
      });
      
      return false;
    } catch (error) {
      console.error('Access validation failed:', error);
      await this.auditLog({
        type: 'access_denied',
        userId,
        resource,
        operation,
        timestamp: new Date().toISOString(),
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      return false;
    }
  }

  /**
   * Get user permissions
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    // In a real implementation, this would fetch from a database or external service
    return this.userPermissions.get(userId) || this.getDefaultPermissions();
  }

  /**
   * Audit log for security events
   */
  async auditLog(event: SecurityEvent): Promise<void> {
    try {
      // Add to in-memory log (in production, this would go to a secure logging service)
      this.auditLogs.push(event);

      // Keep only the last 1000 entries in memory
      if (this.auditLogs.length > 1000) {
        this.auditLogs = this.auditLogs.slice(-1000);
      }

      // In production, send to secure logging service
      await this.sendToAuditService(event);

      console.log(`Security Audit: ${event.type} - User: ${event.userId}, Resource: ${event.resource}, Operation: ${event.operation}`);
    } catch (error) {
      console.error('Failed to audit log security event:', error);
      // Don't throw - logging failures shouldn't break the main flow
    }
  }

  /**
   * Validate and refresh credentials
   */
  async validateCredentials(provider: string): Promise<boolean> {
    try {
      const validator = this.credentialValidators.get(provider);
      if (!validator) {
        console.warn(`No credential validator found for provider: ${provider}`);
        return false;
      }

      const isValid = await validator();
      
      await this.auditLog({
        type: 'credential_used',
        userId: 'system',
        resource: provider,
        operation: 'validate',
        timestamp: new Date().toISOString(),
        metadata: { result: isValid ? 'valid' : 'invalid' }
      });

      return isValid;
    } catch (error) {
      console.error(`Credential validation failed for ${provider}:`, error);
      
      await this.auditLog({
        type: 'credential_used',
        userId: 'system',
        resource: provider,
        operation: 'validate',
        timestamp: new Date().toISOString(),
        metadata: { 
          result: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      return false;
    }
  }

  // Additional security methods

  /**
   * Add user permissions
   */
  setUserPermissions(userId: string, permissions: string[]): void {
    this.userPermissions.set(userId, permissions);
  }

  /**
   * Register credential validator for a provider
   */
  registerCredentialValidator(provider: string, validator: () => Promise<boolean>): void {
    this.credentialValidators.set(provider, validator);
  }

  /**
   * Get audit logs (for admin users)
   */
  async getAuditLogs(userId: string, filters?: {
    startDate?: string;
    endDate?: string;
    eventType?: string;
    targetUser?: string;
  }): Promise<SecurityEvent[]> {
    // Check if user has admin permissions
    const userPerms = await this.getUserPermissions(userId);
    if (!userPerms.includes('admin:*') && !userPerms.includes('audit:read')) {
      throw new Error('Insufficient permissions to access audit logs');
    }

    let logs = [...this.auditLogs];

    // Apply filters
    if (filters) {
      if (filters.startDate) {
        logs = logs.filter(log => log.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        logs = logs.filter(log => log.timestamp <= filters.endDate!);
      }
      if (filters.eventType) {
        logs = logs.filter(log => log.type === filters.eventType);
      }
      if (filters.targetUser) {
        logs = logs.filter(log => log.userId === filters.targetUser);
      }
    }

    await this.auditLog({
      type: 'access_granted',
      userId,
      resource: 'audit_logs',
      operation: 'read',
      timestamp: new Date().toISOString(),
      metadata: { 
        filters,
        resultCount: logs.length
      }
    });

    return logs;
  }

  /**
   * Check for security violations in content
   */
  checkForSecurityViolations(content: string, contentType: string): {
    violations: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      message: string;
      location?: string;
    }>;
    passed: boolean;
  } {
    const violations: any[] = [];

    // Check for common security anti-patterns
    const securityChecks = [
      {
        pattern: /password\s*[:=]\s*['"]/gi,
        type: 'hardcoded_credential',
        severity: 'critical' as const,
        message: 'Hardcoded password detected'
      },
      {
        pattern: /api[_-]?key\s*[:=]\s*['"]/gi,
        type: 'hardcoded_credential',
        severity: 'critical' as const,
        message: 'Hardcoded API key detected'
      },
      {
        pattern: /eval\s*\(/gi,
        type: 'code_injection',
        severity: 'high' as const,
        message: 'Use of eval() function detected'
      },
      {
        pattern: /innerHTML\s*=/gi,
        type: 'xss_risk',
        severity: 'medium' as const,
        message: 'Direct innerHTML assignment - XSS risk'
      },
      {
        pattern: /document\.write\s*\(/gi,
        type: 'xss_risk',
        severity: 'medium' as const,
        message: 'Use of document.write() - XSS risk'
      }
    ];

    for (const check of securityChecks) {
      const matches = Array.from(content.matchAll(check.pattern));
      for (const match of matches) {
        violations.push({
          type: check.type,
          severity: check.severity,
          message: check.message,
          location: `Line ${this.getLineNumber(content, match.index || 0)}`
        });
      }
    }

    const hasCriticalViolations = violations.some(v => v.severity === 'critical');
    const hasHighViolations = violations.some(v => v.severity === 'high');

    return {
      violations,
      passed: !hasCriticalViolations && !hasHighViolations
    };
  }

  // Private methods

  private initializeDefaultPermissions(): void {
    // Set up default permissions for common user types
    this.userPermissions.set('admin', ['admin:*']);
    this.userPermissions.set('developer', [
      'generate:code-diff',
      'generate:test',
      'generate:documentation',
      'validate:*',
      'read:*'
    ]);
    this.userPermissions.set('product_manager', [
      'generate:prd',
      'generate:documentation',
      'read:*'
    ]);
    this.userPermissions.set('qa_engineer', [
      'generate:test',
      'validate:*',
      'read:*'
    ]);

    // Register default credential validators
    this.registerCredentialValidator('github', async () => {
      // Mock validator - in production, would check actual GitHub token
      return true;
    });

    this.registerCredentialValidator('gitlab', async () => {
      // Mock validator - in production, would check actual GitLab token
      return true;
    });
  }

  private getDefaultPermissions(): string[] {
    return ['read:*']; // Default read-only access
  }

  private async sendToAuditService(event: SecurityEvent): Promise<void> {
    // In production, this would send to a secure audit logging service
    // For now, we'll just simulate the call
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  private getLineNumber(content: string, index: number): number {
    const beforeIndex = content.substring(0, index);
    return beforeIndex.split('\n').length;
  }

  /**
   * Validate that a user has sufficient permissions for an artifact type
   */
  async validateArtifactPermissions(userId: string, artifactType: string, operation: 'generate' | 'validate' | 'deploy'): Promise<boolean> {
    const requiredPermissions = this.getRequiredPermissionsForArtifact(artifactType, operation);
    const userPermissions = await this.getUserPermissions(userId);

    for (const required of requiredPermissions) {
      if (!userPermissions.includes(required) && !userPermissions.includes('admin:*')) {
        await this.auditLog({
          type: 'access_denied',
          userId,
          resource: artifactType,
          operation,
          timestamp: new Date().toISOString(),
          metadata: { 
            reason: 'insufficient_permissions',
            required: requiredPermissions,
            actual: userPermissions
          }
        });
        return false;
      }
    }

    return true;
  }

  private getRequiredPermissionsForArtifact(artifactType: string, operation: string): string[] {
    const permissionMap: Record<string, Record<string, string[]>> = {
      'code-diff': {
        generate: ['generate:code-diff'],
        validate: ['validate:code'],
        deploy: ['deploy:code', 'admin:deploy']
      },
      'test': {
        generate: ['generate:test'],
        validate: ['validate:test'],
        deploy: ['deploy:test']
      },
      'prd': {
        generate: ['generate:prd'],
        validate: ['validate:prd'],
        deploy: ['deploy:prd']
      },
      'documentation': {
        generate: ['generate:documentation'],
        validate: ['validate:documentation'],
        deploy: ['deploy:documentation']
      }
    };

    return permissionMap[artifactType]?.[operation] || [`${operation}:${artifactType}`];
  }
} 