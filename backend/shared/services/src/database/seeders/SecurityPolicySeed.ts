import { DataSource, DeepPartial } from 'typeorm';
import { BaseSeed } from './BaseSeed.js';
import { SecurityPolicy } from '../../entities/securityPolicy.entity.js';
import { UserEntity } from '../../entities/user.entity.js';

/**
 * Security Policy seeder
 */
export class SecurityPolicySeed extends BaseSeed<SecurityPolicy> {
  private users: UserEntity[] = [];

  constructor(dataSource: DataSource, users: UserEntity[]) {
    super(dataSource, dataSource.getRepository(SecurityPolicy), 'SecurityPolicies');
    this.users = users;
  }

  getUniqueField(): keyof SecurityPolicy {
    return 'name';
  }

  async getSeedData(): Promise<DeepPartial<SecurityPolicy>[]> {
    const adminUser = this.users.find((u) => u.role === 'system_admin') || this.users[0];

    return [
      {
        name: 'High Security Operations Policy',
        description: 'Security policy for high-risk operations requiring approval',
        conditions: {
          operationTypes: ['high-risk'],
          resourceTypes: ['database', 'api'],
          userRoles: ['system_admin', 'operations_manager'],
          timeRestrictions: {
            allowedHours: [9, 17],
            allowedDays: [1, 2, 3, 4, 5],
            timezone: 'UTC',
          },
          environmentRestrictions: ['production'],
          riskThresholds: {
            minRiskScore: 0.8,
            maxRiskScore: 0.95,
          },
        },
        actions: {
          requireApproval: true,
          approvalRequirements: {
            minimumApprovers: 2,
            requiredRoles: ['system_admin', 'operations_manager'],
            timeoutHours: 24,
          },
          blockOperation: true,
          logLevel: 'error',
          notificationChannels: ['email', 'slack'],
          additionalActions: {
            auditLog: true,
            notification: true,
          },
        },
        isActive: true,
        createdBy: adminUser.id,
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Standard Operations Policy',
        description: 'Default security policy for standard operations',
        conditions: {
          operationTypes: ['standard'],
          resourceTypes: ['database', 'api'],
          userRoles: ['developer', 'data_analyst', 'operations_manager'],
          timeRestrictions: {
            allowedHours: [9, 17],
            allowedDays: [1, 2, 3, 4, 5],
            timezone: 'UTC',
          },
          environmentRestrictions: ['production'],
          riskThresholds: {
            minRiskScore: 0.8,
            maxRiskScore: 0.95,
          },
        },
        actions: {
          requireApproval: true,
          approvalRequirements: {
            minimumApprovers: 1,
            requiredRoles: ['guest'],
            timeoutHours: 24,
          },
          blockOperation: true,
          logLevel: 'error',
          notificationChannels: ['email', 'slack'],
          additionalActions: {
            auditLog: true,
            notification: true,
          },
        },
        isActive: true,
        createdBy: adminUser.id,
        priority: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Guest Access Policy',
        description: 'Restricted policy for guest users',
        conditions: {
          operationTypes: ['standard'],
          resourceTypes: ['database', 'api'],
          userRoles: ['guest'],
          timeRestrictions: {
            allowedHours: [9, 17],
            allowedDays: [1, 2, 3, 4, 5],
            timezone: 'UTC',
          },
          environmentRestrictions: ['production'],
          riskThresholds: {
            minRiskScore: 0.8,
            maxRiskScore: 0.95,
          },
        },
        actions: {
          requireApproval: true,
          approvalRequirements: {
            minimumApprovers: 1,
            requiredRoles: ['guest'],
            timeoutHours: 24,
          },
          blockOperation: true,
          logLevel: 'error',
          notificationChannels: ['email', 'slack'],
          additionalActions: {
            auditLog: true,
            notification: true,
          },
        },
        isActive: true,
        createdBy: adminUser.id,
        priority: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }
}
