import { logger } from '@uaip/utils';
import { BaseRepository } from '../base/BaseRepository.js';
import { SecurityPolicy } from '../../entities/securityPolicy.entity.js';
import { ApprovalWorkflow } from '../../entities/approvalWorkflow.entity.js';
import { ApprovalDecision } from '../../entities/approvalDecision.entity.js';

export class SecurityPolicyRepository extends BaseRepository<SecurityPolicy> {
  constructor() {
    super(SecurityPolicy);
  }

  /**
   * Create security policy
   */
  public async createSecurityPolicy(policyData: {
    name: string;
    description: string;
    priority: number;
    isActive: boolean;
    conditions: any;
    actions: any;
    createdBy: string;
  }): Promise<SecurityPolicy> {
    const policy = this.repository.create(policyData);
    return await this.repository.save(policy);
  }

  /**
   * Query security policies with filters and pagination
   */
  public async querySecurityPolicies(filters: {
    active?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ policies: SecurityPolicy[]; total: number }> {
    const queryBuilder = this.repository.createQueryBuilder('policy');

    if (filters.active !== undefined) {
      queryBuilder.andWhere('policy.isActive = :active', { active: filters.active });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(policy.name ILIKE :search OR policy.description ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    queryBuilder.orderBy('policy.priority', 'DESC').addOrderBy('policy.createdAt', 'DESC');

    // Get total count for pagination
    const total = await queryBuilder.getCount();

    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }

    const policies = await queryBuilder.getMany();

    return { policies, total };
  }

  /**
   * Get security policy statistics
   */
  public async getSecurityPolicyStats(): Promise<{
    totalPolicies: number;
    activePolicies: number;
    inactivePolicies: number;
  }> {
    const [totalPolicies, activePolicies] = await Promise.all([
      this.repository.count(),
      this.repository.count({ where: { isActive: true } })
    ]);

    return {
      totalPolicies,
      activePolicies,
      inactivePolicies: totalPolicies - activePolicies
    };
  }
}

export class ApprovalWorkflowRepository extends BaseRepository<ApprovalWorkflow> {
  constructor() {
    super(ApprovalWorkflow);
  }

  /**
   * Create a new approval workflow
   */
  public async createApprovalWorkflow(workflowData: {
    id: string;
    operationId: string;
    requiredApprovers: string[];
    currentApprovers?: string[];
    status: string;
    expiresAt?: Date;
    metadata?: Record<string, any>;
  }): Promise<ApprovalWorkflow> {
    const workflow = this.repository.create({
      id: workflowData.id,
      operationId: workflowData.operationId,
      requiredApprovers: workflowData.requiredApprovers,
      currentApprovers: workflowData.currentApprovers || [],
      status: workflowData.status as any,
      expiresAt: workflowData.expiresAt,
      metadata: workflowData.metadata
    });
    return await this.repository.save(workflow);
  }

  /**
   * Update approval workflow
   */
  public async updateApprovalWorkflow(workflowId: string, updates: Partial<ApprovalWorkflow>): Promise<ApprovalWorkflow | null> {
    await this.repository.update(workflowId, { ...updates, updatedAt: new Date() });
    return await this.repository.findOne({ where: { id: workflowId } });
  }

  /**
   * Get workflows for a user (as approver)
   */
  public async getUserApprovalWorkflows(userId: string, status?: string): Promise<ApprovalWorkflow[]> {
    const queryBuilder = this.repository.createQueryBuilder('workflow')
      .where('workflow.requiredApprovers @> :userId', { 
        userId: JSON.stringify([userId]) 
      });

    if (status) {
      queryBuilder.andWhere('workflow.status = :status', { status });
    }

    return await queryBuilder
      .orderBy('workflow.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Get pending workflows for reminders
   */
  public async getPendingWorkflowsForReminders(reminderThreshold: Date): Promise<ApprovalWorkflow[]> {
    return await this.repository
      .createQueryBuilder('workflow')
      .where('workflow.status = :status', { status: 'pending' })
      .andWhere('workflow.createdAt <= :threshold', { threshold: reminderThreshold })
      .andWhere('(workflow.lastReminderAt IS NULL OR workflow.lastReminderAt <= :threshold)', { threshold: reminderThreshold })
      .getMany();
  }

  /**
   * Get expired workflows
   */
  public async getExpiredWorkflows(): Promise<ApprovalWorkflow[]> {
    try {
      const now = new Date();
      logger.debug('Querying for expired workflows', { 
        currentTime: now.toISOString(),
        query: 'status = pending AND expiresAt <= now'
      });

      const workflows = await this.repository
        .createQueryBuilder('workflow')
        .where('workflow.status = :status', { status: 'pending' })
        .andWhere('workflow.expiresAt <= :now', { now })
        .getMany();

      logger.debug('Expired workflows query result', { 
        count: workflows.length,
        workflowIds: workflows.map(w => w.id)
      });

      return workflows;
    } catch (error) {
      logger.error('Failed to query expired workflows', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error
      });
      throw error;
    }
  }
}

export class ApprovalDecisionRepository extends BaseRepository<ApprovalDecision> {
  constructor() {
    super(ApprovalDecision);
  }

  /**
   * Create approval decision
   */
  public async createApprovalDecision(decisionData: {
    id: string;
    workflowId: string;
    approverId: string;
    decision: 'approve' | 'reject';
    conditions?: string[];
    feedback?: string;
    decidedAt: Date;
  }): Promise<ApprovalDecision> {
    const decision = this.repository.create(decisionData);
    return await this.repository.save(decision);
  }

  /**
   * Get approval decisions for a workflow
   */
  public async getApprovalDecisions(workflowId: string): Promise<ApprovalDecision[]> {
    return await this.repository.find({
      where: { workflowId },
      order: { decidedAt: 'ASC' }
    });
  }
} 