import { randomUUID } from 'node:crypto'
import {
  EventBusService,
  getControlDb,
  OperationRepository,
  SYSTEM_AGENT_ID,
  SYSTEM_USER_ID,
} from '@uaip/shared-services'
import { and, eq } from '@uaip/shared-services/drizzle/clients'
import { operations } from '@uaip/shared-services/drizzle/control'
import type {
  ApprovalMetadata,
  EventBusMessage,
  ExecutionPlan,
  PendingApproval,
  StoredPendingApproval,
} from '@uaip/types'
import { OperationStatus, RDLOApprovalGate } from '@uaip/types'
import { logger, InternalServerError, NotFoundError } from '@uaip/utils'

type ApprovalStatus = PendingApproval['status']

const RDLO_APPROVAL_PENDING_EVENT = 'rdlo.approval.pending'
const RDLO_APPROVAL_TIMEOUT_EVENT = 'rdlo.approval.timeout'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export class RDLOApprovalService {
  private readonly inflightWaits = new Map<string, Promise<PendingApproval>>()
  private timeoutSubscriptionInitialized = false

  constructor(private readonly eventBusService: EventBusService) {}

  async initialize(): Promise<void> {
    if (this.timeoutSubscriptionInitialized) {
      return
    }

    await this.eventBusService.subscribe(RDLO_APPROVAL_TIMEOUT_EVENT, async (event: EventBusMessage) => {
      const approvalId = this.extractApprovalId(event.data)
      if (!approvalId) {
        logger.warn('RDLO approval timeout event missing approval id', {
          eventType: event.type,
          eventId: event.id,
        })
        return
      }

      await this.expireApproval(approvalId)
    })

    this.timeoutSubscriptionInitialized = true
  }

  async createGate(
    gate: RDLOApprovalGate,
    context: Record<string, unknown>,
    timeoutMs: number = 300_000
  ): Promise<PendingApproval> {
    const now = new Date()
    const approvalId = randomUUID()
    const expiresAt = new Date(now.getTime() + timeoutMs)

    const executionPlan: ExecutionPlan = {
      id: approvalId,
      type: 'rdlo-approval',
      agentId: SYSTEM_AGENT_ID,
      steps: [],
      dependencies: [],
      estimatedDuration: timeoutMs,
      priority: 'high',
      constraints: [],
      metadata: {
        generatedBy: 'rdlo-approval-service',
        basedOnAnalysis: now,
        version: '1.0.0',
      },
      created_at: now,
    }

    const metadata: Record<string, unknown> = {
      approval: {
        gate,
        context,
        status: 'pending',
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
      },
    }

    // Via the repository so the cross-plane agentId is verified before insert.
    const created = await new OperationRepository().createOperation({
      id: approvalId,
      type: 'rdlo-approval',
      status: OperationStatus.PENDING,
      agentId: SYSTEM_AGENT_ID,
      userId: SYSTEM_USER_ID,
      name: `${gate} approval gate`,
      executionPlan,
      metadata,
      dependencies: [],
      dependentOperations: [],
      tags: ['rdlo', 'approval'],
      currentStep: 0,
      retryCount: 0,
      maxRetries: 0,
      timeoutDuration: timeoutMs,
    })

    const approval: StoredPendingApproval | null = this.toStoredPendingApproval(created)
    if (!approval) {
      throw new InternalServerError(`Failed to parse created approval ${created.id}`)
    }

    await this.eventBusService.publish(RDLO_APPROVAL_PENDING_EVENT, {
      approval: this.toPublicPendingApproval(approval),
      gate,
      context,
      expiresAt: approval.expiresAt,
    })

    await this.scheduleTimeoutJob(approval.id, timeoutMs)

    return this.toPublicPendingApproval(approval)
  }

  async waitForApproval(approvalId: string): Promise<PendingApproval> {
    const existingPromise = this.inflightWaits.get(approvalId)
    if (existingPromise) {
      return existingPromise
    }

    const current = await this.getStoredApprovalById(approvalId)
    if (!current) {
      throw new NotFoundError(`Approval ${approvalId} not found`)
    }

    if (current.status !== 'pending') {
      return this.toPublicPendingApproval(current)
    }

    const waitPromise = new Promise<PendingApproval>((resolve, reject) => {
      const responseEvent = this.responseEventFor(approvalId)
      const expiresAtMs = new Date(current.expiresAt).getTime()
      const timeoutMs = Math.max(expiresAtMs - Date.now(), 0)

      const complete = (result: PendingApproval): void => {
        clearTimeout(timeoutId)
        this.inflightWaits.delete(approvalId)
        void this.eventBusService.unsubscribe(responseEvent, responseHandler)
        resolve(result)
      }

      const fail = (error: Error): void => {
        clearTimeout(timeoutId)
        this.inflightWaits.delete(approvalId)
        void this.eventBusService.unsubscribe(responseEvent, responseHandler)
        reject(error)
      }

      const responseHandler = async (event: EventBusMessage): Promise<void> => {
        const approval = this.extractApprovalFromResponse(event.data)
        if (approval) {
          complete(approval)
          return
        }

        const latest = await this.getStoredApprovalById(approvalId)
        if (latest) {
          complete(this.toPublicPendingApproval(latest))
        } else {
          fail(new Error(`Approval ${approvalId} no longer exists`))
        }
      }

      const timeoutId = setTimeout(() => {
        void (async () => {
          await this.expireApproval(approvalId)
          const latest = await this.getStoredApprovalById(approvalId)
          if (latest) {
            complete(this.toPublicPendingApproval(latest))
          } else {
            fail(new Error(`Approval ${approvalId} no longer exists`))
          }
        })()
      }, timeoutMs)

      void this.eventBusService
        .subscribe(responseEvent, responseHandler)
        .catch((error) => fail(error instanceof Error ? error : new Error(String(error))))
    })

    this.inflightWaits.set(approvalId, waitPromise)
    return waitPromise
  }

  async handleResponse(id: string, approved: boolean, comment?: string): Promise<PendingApproval> {
    const db = getControlDb()
    const [row] = await db
      .select()
      .from(operations)
      .where(and(eq(operations.id, id), eq(operations.type, 'rdlo-approval')))
      .limit(1)

    if (!row) {
      throw new NotFoundError(`Approval ${id} not found`)
    }

    const current = this.toStoredPendingApproval(row)
    if (!current) {
      throw new InternalServerError(`Approval ${id} has malformed metadata`)
    }

    if (current.status !== 'pending') {
      return this.toPublicPendingApproval(current)
    }

    const resolvedAt = new Date().toISOString()
    const status: ApprovalStatus = approved ? 'approved' : 'rejected'
    const updatedMetadata: Record<string, unknown> = {
      approval: {
        gate: current.gate,
        context: current.context,
        status,
        expiresAt: current.expiresAt,
        createdAt: current.createdAt,
        ...(comment ? { comment } : {}),
        resolvedAt,
      },
    }

    const [updated] = await db
      .update(operations)
      .set({
        status: approved ? OperationStatus.COMPLETED : OperationStatus.FAILED,
        completedAt: new Date(resolvedAt),
        updatedAt: new Date(resolvedAt),
        metadata: updatedMetadata,
      })
      .where(eq(operations.id, id))
      .returning()

    const approval = this.toStoredPendingApproval(updated)
    if (!approval) {
      throw new InternalServerError(`Failed to parse resolved approval ${id}`)
    }

    await this.eventBusService.publish(this.responseEventFor(id), {
      approval: this.toPublicPendingApproval(approval),
      approved,
      comment,
    })

    return this.toPublicPendingApproval(approval)
  }

  private async expireApproval(approvalId: string): Promise<void> {
    const db = getControlDb()
    const [row] = await db
      .select()
      .from(operations)
      .where(and(eq(operations.id, approvalId), eq(operations.type, 'rdlo-approval')))
      .limit(1)

    if (!row) {
      return
    }

    const approval = this.toStoredPendingApproval(row)
    if (!approval || approval.status !== 'pending') {
      return
    }

    const resolvedAt = new Date().toISOString()
    const metadata: Record<string, unknown> = {
      approval: {
        gate: approval.gate,
        context: approval.context,
        status: 'expired',
        expiresAt: approval.expiresAt,
        createdAt: approval.createdAt,
        comment: 'Approval timed out',
        resolvedAt,
      },
    }

    const [updated] = await db
      .update(operations)
      .set({
        status: OperationStatus.FAILED,
        completedAt: new Date(resolvedAt),
        updatedAt: new Date(resolvedAt),
        metadata,
      })
      .where(eq(operations.id, approvalId))
      .returning()

    const expired = this.toStoredPendingApproval(updated)
    if (!expired) {
      return
    }

    logger.warn('RDLO approval expired due to timeout', {
      approvalId,
      gate: expired.gate,
    })

    await this.eventBusService.publish(this.responseEventFor(approvalId), {
      approval: this.toPublicPendingApproval(expired),
      approved: false,
      comment: 'Approval timed out',
    })
  }

  private async scheduleTimeoutJob(approvalId: string, timeoutMs: number): Promise<void> {
    const queue = this.getTimeoutQueue()
    const now = new Date()
    await queue.add(
      `rdlo-approval-timeout-${approvalId}`,
      {
        id: `${approvalId}-${now.getTime()}`,
        type: RDLO_APPROVAL_TIMEOUT_EVENT,
        source: 'orchestration-pipeline',
        data: { approvalId },
        timestamp: now,
        version: '1.0.0',
        correlationId: `rdlo-approval-timeout-${approvalId}`,
      },
      {
        jobId: `rdlo-approval-timeout:${approvalId}`,
        delay: timeoutMs,
        removeOnComplete: { age: 86400, count: 100 },
        removeOnFail: { age: 604800, count: 100 },
        attempts: 1,
      }
    )
  }

  private getTimeoutQueue() {
    return this.eventBusService.getOrCreateQueue(RDLO_APPROVAL_TIMEOUT_EVENT)
  }

  private async getStoredApprovalById(approvalId: string): Promise<StoredPendingApproval | null> {
    const db = getControlDb()
    const [row] = await db
      .select()
      .from(operations)
      .where(and(eq(operations.id, approvalId), eq(operations.type, 'rdlo-approval')))
      .limit(1)

    if (!row) {
      return null
    }

    return this.toStoredPendingApproval(row)
  }

  private toStoredPendingApproval(row: typeof operations.$inferSelect): StoredPendingApproval | null {
    const metadata = this.toApprovalMetadata(row.metadata)
    if (!metadata) {
      return null
    }

    return {
      id: row.id,
      gate: metadata.approval.gate,
      context: metadata.approval.context,
      status: metadata.approval.status,
      comment: metadata.approval.comment,
      expiresAt: metadata.approval.expiresAt,
      createdAt: metadata.approval.createdAt,
      resolvedAt: metadata.approval.resolvedAt,
    }
  }

  private toPublicPendingApproval(approval: StoredPendingApproval): PendingApproval {
    return {
      id: approval.id,
      gate: approval.gate,
      context: approval.context,
      status: approval.status,
      ...(approval.comment ? { comment: approval.comment } : {}),
      createdAt: approval.createdAt,
      ...(approval.resolvedAt ? { resolvedAt: approval.resolvedAt } : {}),
    }
  }

  private toApprovalMetadata(metadata: Record<string, unknown> | null): ApprovalMetadata | null {
    if (!metadata || !('approval' in metadata) || !isRecord(metadata.approval)) {
      return null
    }

    const approval = metadata.approval
    const status = this.parseStatus(approval.status)

    if (
      !this.isGate(approval.gate) ||
      !isRecord(approval.context) ||
      !status ||
      typeof approval.expiresAt !== 'string' ||
      typeof approval.createdAt !== 'string'
    ) {
      return null
    }

    return {
      approval: {
        gate: approval.gate,
        context: approval.context,
        status,
        expiresAt: approval.expiresAt,
        createdAt: approval.createdAt,
        ...(typeof approval.comment === 'string' ? { comment: approval.comment } : {}),
        ...(typeof approval.resolvedAt === 'string' ? { resolvedAt: approval.resolvedAt } : {}),
      },
    }
  }

  private parseStatus(value: unknown): ApprovalStatus | null {
    if (value === 'pending') return 'pending'
    if (value === 'approved') return 'approved'
    if (value === 'rejected') return 'rejected'
    if (value === 'expired') return 'expired'
    return null
  }

  private isGate(value: unknown): value is RDLOApprovalGate {
    return (
      value === RDLOApprovalGate.KB_REVIEW ||
      value === RDLOApprovalGate.PROJECT_REVIEW ||
      value === RDLOApprovalGate.ARCHITECTURE_REVIEW ||
      value === RDLOApprovalGate.PR_REVIEW ||
      value === RDLOApprovalGate.CI_FIX_ESCALATION
    )
  }

  private extractApprovalId(data: unknown): string | null {
    if (!isRecord(data) || typeof data.approvalId !== 'string') {
      return null
    }

    return data.approvalId
  }

  private extractApprovalFromResponse(data: unknown): PendingApproval | null {
    if (!isRecord(data) || !('approval' in data) || !isRecord(data.approval)) {
      return null
    }

    const value = data.approval
    const status = this.parseStatus(value.status)

    if (
      typeof value.id !== 'string' ||
      !this.isGate(value.gate) ||
      !isRecord(value.context) ||
      !status ||
      typeof value.createdAt !== 'string'
    ) {
      return null
    }

    return {
      id: value.id,
      gate: value.gate,
      context: value.context,
      status,
      ...(typeof value.comment === 'string' ? { comment: value.comment } : {}),
      createdAt: value.createdAt,
      ...(typeof value.resolvedAt === 'string' ? { resolvedAt: value.resolvedAt } : {}),
    }
  }

  private responseEventFor(approvalId: string): string {
    return `rdlo.approval.response.${approvalId}`
  }
}
