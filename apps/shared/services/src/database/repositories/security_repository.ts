import { eq, and, desc, count } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import {
  securityPolicies,
  approvalWorkflows,
  approvalDecisions,
  type ApprovalWorkflow,
  type NewApprovalWorkflow,
} from '../drizzle/schemas/control_schema';
import { logger } from '@uaip/utils';

export class SecurityPolicyRepository {
  private get db() {
    return getControlDb();
  }

  async findAll(): Promise<(typeof securityPolicies.$inferSelect)[]> {
    try {
      return this.db.select().from(securityPolicies).orderBy(desc(securityPolicies.priority));
    } catch (error) {
      logger.error('SecurityPolicyRepository.findAll failed', { error: (error as Error).message });
      throw error;
    }
  }

  async findById(id: string): Promise<typeof securityPolicies.$inferSelect | null> {
    try {
      const [row] = await this.db.select().from(securityPolicies).where(eq(securityPolicies.id, id)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('SecurityPolicyRepository.findById failed', { id, error: (error as Error).message });
      throw error;
    }
  }

  async findEnabled(): Promise<(typeof securityPolicies.$inferSelect)[]> {
    try {
      return this.db.select().from(securityPolicies).where(eq(securityPolicies.isEnabled, true)).orderBy(desc(securityPolicies.priority));
    } catch (error) {
      logger.error('SecurityPolicyRepository.findEnabled failed', { error: (error as Error).message });
      throw error;
    }
  }

  async findByType(policyType: string): Promise<(typeof securityPolicies.$inferSelect)[]> {
    try {
      return this.db.select().from(securityPolicies).where(eq(securityPolicies.policyType, policyType));
    } catch (error) {
      logger.error('SecurityPolicyRepository.findByType failed', { error: (error as Error).message });
      throw error;
    }
  }

  async findByCategory(category: string): Promise<(typeof securityPolicies.$inferSelect)[]> {
    return this.findByType(category);
  }

  async create(data: typeof securityPolicies.$inferInsert): Promise<typeof securityPolicies.$inferSelect> {
    try {
      const [row] = await this.db.insert(securityPolicies).values(data).returning();
      return row;
    } catch (error) {
      logger.error('SecurityPolicyRepository.create failed', { error: (error as Error).message });
      throw error;
    }
  }

  async update(id: string, data: Partial<typeof securityPolicies.$inferInsert>): Promise<typeof securityPolicies.$inferSelect | null> {
    try {
      const [row] = await this.db.update(securityPolicies).set(data).where(eq(securityPolicies.id, id)).returning();
      return row ?? null;
    } catch (error) {
      logger.error('SecurityPolicyRepository.update failed', { id, error: (error as Error).message });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.delete(securityPolicies).where(eq(securityPolicies.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      logger.error('SecurityPolicyRepository.delete failed', { id, error: (error as Error).message });
      throw error;
    }
  }

  async getStats(): Promise<{ total: number; enabled: number; disabled: number }> {
    try {
      const all = await this.db.select({ value: count() }).from(securityPolicies);
      const enabled = await this.db.select({ value: count() }).from(securityPolicies).where(eq(securityPolicies.isEnabled, true));
      const total = Number(all[0]?.value ?? 0);
      const enabledCount = Number(enabled[0]?.value ?? 0);
      return { total, enabled: enabledCount, disabled: total - enabledCount };
    } catch (error) {
      logger.error('SecurityPolicyRepository.getStats failed', { error: (error as Error).message });
      throw error;
    }
  }
}

export class ApprovalWorkflowRepository {
  private get db() {
    return getControlDb();
  }

  async findById(id: string): Promise<ApprovalWorkflow | null> {
    try {
      const [row] = await this.db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, id)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('ApprovalWorkflowRepository.findById failed', { id, error: (error as Error).message });
      throw error;
    }
  }

  async findByOperationId(operationId: string): Promise<ApprovalWorkflow | null> {
    try {
      const [row] = await this.db.select().from(approvalWorkflows).where(eq(approvalWorkflows.operationId, operationId)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('ApprovalWorkflowRepository.findByOperationId failed', { error: (error as Error).message });
      throw error;
    }
  }

  async findPending(): Promise<ApprovalWorkflow[]> {
    try {
      return this.db.select().from(approvalWorkflows).where(eq(approvalWorkflows.status, 'pending')).orderBy(desc(approvalWorkflows.createdAt));
    } catch (error) {
      logger.error('ApprovalWorkflowRepository.findPending failed', { error: (error as Error).message });
      throw error;
    }
  }

  async findMany(filters: { status?: string; limit?: number; offset?: number } = {}): Promise<{ workflows: ApprovalWorkflow[]; total: number }> {
    try {
      const where = filters.status ? eq(approvalWorkflows.status, filters.status) : undefined;
      const [{ value: total }] = await this.db.select({ value: count() }).from(approvalWorkflows).where(where);
      const workflows = await this.db
        .select()
        .from(approvalWorkflows)
        .where(where)
        .orderBy(desc(approvalWorkflows.createdAt))
        .limit(filters.limit ?? 20)
        .offset(filters.offset ?? 0);
      return { workflows, total: Number(total) };
    } catch (error) {
      logger.error('ApprovalWorkflowRepository.findMany failed', { error: (error as Error).message });
      throw error;
    }
  }

  async createApprovalWorkflow(data: NewApprovalWorkflow): Promise<ApprovalWorkflow> {
    try {
      const [row] = await this.db.insert(approvalWorkflows).values(data).returning();
      return row;
    } catch (error) {
      logger.error('ApprovalWorkflowRepository.createApprovalWorkflow failed', { error: (error as Error).message });
      throw error;
    }
  }

  async update(id: string, data: Partial<NewApprovalWorkflow>): Promise<ApprovalWorkflow | null> {
    try {
      const [row] = await this.db.update(approvalWorkflows).set(data).where(eq(approvalWorkflows.id, id)).returning();
      return row ?? null;
    } catch (error) {
      logger.error('ApprovalWorkflowRepository.update failed', { id, error: (error as Error).message });
      throw error;
    }
  }

  async getStats(): Promise<{ total: number; pending: number; approved: number; rejected: number }> {
    try {
      const [{ value: total }] = await this.db.select({ value: count() }).from(approvalWorkflows);
      const [{ value: pending }] = await this.db.select({ value: count() }).from(approvalWorkflows).where(eq(approvalWorkflows.status, 'pending'));
      const [{ value: approved }] = await this.db.select({ value: count() }).from(approvalWorkflows).where(eq(approvalWorkflows.status, 'approved'));
      const [{ value: rejected }] = await this.db.select({ value: count() }).from(approvalWorkflows).where(eq(approvalWorkflows.status, 'rejected'));
      return { total: Number(total), pending: Number(pending), approved: Number(approved), rejected: Number(rejected) };
    } catch (error) {
      logger.error('ApprovalWorkflowRepository.getStats failed', { error: (error as Error).message });
      throw error;
    }
  }
}

export class ApprovalDecisionRepository {
  private get db() {
    return getControlDb();
  }

  async findByWorkflowId(workflowId: string): Promise<(typeof approvalDecisions.$inferSelect)[]> {
    try {
      return this.db.select().from(approvalDecisions).where(eq(approvalDecisions.workflowId, workflowId)).orderBy(desc(approvalDecisions.createdAt));
    } catch (error) {
      logger.error('ApprovalDecisionRepository.findByWorkflowId failed', { error: (error as Error).message });
      throw error;
    }
  }

  async create(data: typeof approvalDecisions.$inferInsert): Promise<typeof approvalDecisions.$inferSelect> {
    try {
      const [row] = await this.db.insert(approvalDecisions).values(data).returning();
      return row;
    } catch (error) {
      logger.error('ApprovalDecisionRepository.create failed', { error: (error as Error).message });
      throw error;
    }
  }
}
