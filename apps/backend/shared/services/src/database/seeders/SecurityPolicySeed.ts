import { getControlDb } from '../drizzle/clients/index';
import { securityPolicies } from '../../database/drizzle/schemas/control.schema';
import { BaseSeed } from './BaseSeed';

export class SecurityPolicySeed extends BaseSeed {
  private db = getControlDb();

  constructor() {
    super('SecurityPolicies');
  }

  async seed(): Promise<any[]> {
    const seedData = await this.getSeedData();

    for (const policy of seedData) {
      await this.db.insert(securityPolicies).values(policy as any).onConflictDoNothing();
    }

    return await this.db.select().from(securityPolicies);
  }

  async getSeedData(): Promise<any[]> {
    return [
      {
        name: 'High Security Operations Policy',
        description: 'Security policy for high-risk operations requiring approval',
        policyType: 'high-risk',
        rules: {
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
        isEnabled: true,
        priority: 1,
        appliesTo: ['system_admin', 'operations_manager'],
        metadata: {},
      },
      {
        name: 'Standard Operations Policy',
        description: 'Default security policy for standard operations',
        policyType: 'standard',
        rules: {
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
        isEnabled: true,
        priority: 2,
        appliesTo: ['developer', 'data_analyst', 'operations_manager'],
        metadata: {},
      },
      {
        name: 'Guest Access Policy',
        description: 'Restricted policy for guest users',
        policyType: 'guest',
        rules: {
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
        isEnabled: true,
        priority: 3,
        appliesTo: ['guest'],
        metadata: {},
      },
    ];
  }
}
