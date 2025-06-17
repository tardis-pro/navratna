import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity.js';

export interface SecurityPolicyConditions {
  operationTypes?: string[];
  resourceTypes?: string[];
  userRoles?: string[];
  timeRestrictions?: {
    allowedHours?: number[];
    allowedDays?: number[];
    timezone?: string;
  };
  environmentRestrictions?: string[];
  riskThresholds?: {
    minRiskScore?: number;
    maxRiskScore?: number;
  };
}

export interface SecurityPolicyActions {
  requireApproval?: boolean;
  approvalRequirements?: {
    minimumApprovers?: number;
    requiredRoles?: string[];
    timeoutHours?: number;
  };
  blockOperation?: boolean;
  logLevel?: 'info' | 'warn' | 'error';
  notificationChannels?: string[];
  additionalActions?: Record<string, any>;
}

@Entity('security_policies')
export class SecurityPolicy extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'integer' })
  priority!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb' })
  conditions!: SecurityPolicyConditions;

  @Column({ type: 'jsonb' })
  actions!: SecurityPolicyActions;

  @Column({ name: 'created_by', type: 'string' })
  createdBy!: string;
} 