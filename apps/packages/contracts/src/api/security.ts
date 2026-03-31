export type {
  RiskLevel,
  RiskAssessment,
  RiskFactor,
  ApprovalWorkflow as SecurityPolicy,
} from '@uaip/types';

export interface SecurityRule {
  id: string;
  type: 'allow' | 'deny' | 'require_approval';
  resource: string;
  action: string;
  conditions?: Record<string, unknown>;
  riskLevel?: string;
}

export interface ApprovalRequirement {
  required: boolean;
  riskLevel?: string;
  reason?: string;
  approvers?: string[];
}

export interface SecurityEvent {
  id: string;
  type: string;
  userId?: string;
  resourceType: string;
  resourceId?: string;
  action: string;
  result: 'allowed' | 'denied' | 'pending';
  riskLevel?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface SecurityStats {
  totalEvents: number;
  deniedEvents: number;
  pendingApprovals: number;
  riskDistribution: Record<string, number>;
  topActions: Array<{ action: string; count: number }>;
}

export interface PolicyCreate {
  name: string;
  description?: string;
  rules: SecurityRule[];
  priority?: number;
  isActive?: boolean;
}

export interface PolicyUpdate {
  name?: string;
  description?: string;
  rules?: SecurityRule[];
  priority?: number;
  isActive?: boolean;
}
