/**
 * WorkflowCompositionService — CRUD, lifecycle, and execution for workflow compositions.
 *
 * PM-270: Core service that ties together WorkflowValidator, SecretReferenceService,
 * and ImmutableAuditService to manage the full composition lifecycle.
 */

import { logger } from '@uaip/utils'
import {
  workflowExecutionTotal,
  workflowExecutionDuration,
  workflowPolicyViolationsTotal,
  workflowActiveExecutions,
} from '@uaip/shared-services'
import {
  getControlDb,
  eq,
  and,
  desc,
  sql,
  workflowCompositions,
  workflowInstances,
  WorkflowValidator,
  ImmutableAuditService,
  SecretReferenceService,
  ConfidenceGatedExecutionService,
  CompositionPolicyService,
} from '@uaip/shared-services'
import type {
  WorkflowComposition,
  WorkflowInstance,
} from '@uaip/shared-services'
import type { CompositionDefinition } from '@uaip/types'

// ─── Filter Types ──────────────────────────────────────────────────────────

export interface CompositionListFilters {
  category?: string
  isActive?: boolean
  userId?: string
  isPublic?: boolean
}

// ─── Service ───────────────────────────────────────────────────────────────

export class WorkflowCompositionService {
  private static instance: WorkflowCompositionService
  private validator: WorkflowValidator
  private auditService: ImmutableAuditService
  private secretService: SecretReferenceService
  private confidenceGateService: ConfidenceGatedExecutionService
  private policyService: CompositionPolicyService

  constructor(
    validator?: WorkflowValidator,
    auditService?: ImmutableAuditService,
    secretService?: SecretReferenceService,
    confidenceGateService?: ConfidenceGatedExecutionService,
    policyService?: CompositionPolicyService,
  ) {
    this.validator = validator ?? WorkflowValidator.getInstance()
    this.auditService = auditService ?? ImmutableAuditService.getInstance()
    this.confidenceGateService = confidenceGateService ?? ConfidenceGatedExecutionService.getInstance()
    this.secretService = secretService ?? SecretReferenceService.getInstance()
    this.policyService = policyService ?? CompositionPolicyService.getInstance()
  }

  static getInstance(): WorkflowCompositionService {
    if (!WorkflowCompositionService.instance) {
      WorkflowCompositionService.instance = new WorkflowCompositionService()
    }
    return WorkflowCompositionService.instance
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────

  async create(definition: CompositionDefinition, userId: string): Promise<WorkflowComposition> {
    const secretScan = this.secretService.scanForRawSecrets(definition)
    if (!secretScan.clean) {
      throw new Error(
        `Workflow definition contains raw secrets and cannot be stored. ` +
        `Use vault:// or secret:// references. Flagged paths: ${secretScan.flaggedPaths.join(', ')}`
      )
    }

    const db = getControlDb()

    const [record] = await db
      .insert(workflowCompositions)
      .values({
        name: definition.name,
        description: definition.description,
        version: definition.version,
        category: definition.category,
        tags: definition.tags,
        definition: definition as unknown as Record<string, unknown>,
        composedBy: 'user',
        userId,
        isActive: false, // Must be activated explicitly after validation
        isPublic: definition.isPublic,
      })
      .returning()

    await this.auditService.appendEvent({
      eventType: 'composition.created',
      entityType: 'workflow_composition',
      entityId: record.id,
      actorType: 'user',
      actorId: userId,
      details: { name: definition.name, version: definition.version },
    })

    logger.info('Workflow composition created', { id: record.id, name: definition.name })
    return record
  }

  async update(id: string, updates: Partial<CompositionDefinition>, userId?: string): Promise<WorkflowComposition> {
    const db = getControlDb()

    const existing = await this.get(id)
    if (!existing) {
      throw new Error(`Workflow composition not found: ${id}`)
    }

    // Merge the existing definition with updates
    const currentDef = existing.definition as unknown as CompositionDefinition
    const mergedDefinition = { ...currentDef, ...updates }

    const updateValues: Record<string, unknown> = {
      definition: mergedDefinition as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    }

    // Sync top-level columns from the definition
    if (updates.name !== undefined) updateValues.name = updates.name
    if (updates.description !== undefined) updateValues.description = updates.description
    if (updates.version !== undefined) updateValues.version = updates.version
    if (updates.category !== undefined) updateValues.category = updates.category
    if (updates.tags !== undefined) updateValues.tags = updates.tags
    if (updates.isPublic !== undefined) updateValues.isPublic = updates.isPublic

    const secretScan = this.secretService.scanForRawSecrets(mergedDefinition)
    if (!secretScan.clean) {
      throw new Error(
        `Workflow definition update contains raw secrets and cannot be stored. ` +
        `Use vault:// or secret:// references. Flagged paths: ${secretScan.flaggedPaths.join(', ')}`
      )
    }

    if (existing.isActive) {
      updateValues.isActive = false
    }

    const [record] = await db
      .update(workflowCompositions)
      .set(updateValues)
      .where(eq(workflowCompositions.id, id))
      .returning()

    await this.auditService.appendEvent({
      eventType: 'composition.updated',
      entityType: 'workflow_composition',
      entityId: id,
      actorType: 'user',
      actorId: userId ?? 'system',
      details: { updatedFields: Object.keys(updates) },
    })

    logger.info('Workflow composition updated', { id, updatedFields: Object.keys(updates) })
    return record
  }

  async get(id: string): Promise<WorkflowComposition | null> {
    const db = getControlDb()
    const records = await db
      .select()
      .from(workflowCompositions)
      .where(eq(workflowCompositions.id, id))

    return records[0] ?? null
  }

  async list(filters?: CompositionListFilters): Promise<WorkflowComposition[]> {
    const db = getControlDb()

    const conditions = []
    if (filters?.category) {
      conditions.push(eq(workflowCompositions.category, filters.category))
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(workflowCompositions.isActive, filters.isActive))
    }
    if (filters?.userId) {
      conditions.push(eq(workflowCompositions.userId, filters.userId))
    }
    if (filters?.isPublic !== undefined) {
      conditions.push(eq(workflowCompositions.isPublic, filters.isPublic))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    return db
      .select()
      .from(workflowCompositions)
      .where(whereClause)
      .orderBy(desc(workflowCompositions.updatedAt))
  }

  async delete(id: string, userId?: string): Promise<void> {
    const db = getControlDb()

    const existing = await this.get(id)
    if (!existing) {
      throw new Error(`Workflow composition not found: ${id}`)
    }

    if (existing.isActive) {
      throw new Error('Cannot delete an active workflow composition. Deactivate it first.')
    }

    await db.delete(workflowCompositions).where(eq(workflowCompositions.id, id))

    await this.auditService.appendEvent({
      eventType: 'composition.deleted',
      entityType: 'workflow_composition',
      entityId: id,
      actorType: 'user',
      actorId: userId ?? 'system',
      details: { name: existing.name },
    })

    logger.info('Workflow composition deleted', { id, name: existing.name })
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  async activate(id: string, userId?: string): Promise<{ valid: boolean; errors: unknown[] }> {
    const existing = await this.get(id)
    if (!existing) {
      throw new Error(`Workflow composition not found: ${id}`)
    }

    const definition = existing.definition as unknown as CompositionDefinition

    // Run full validation
    const validationResult = await this.validator.validate(definition)

    // Run secret scan
    const secretScan = this.secretService.scanForRawSecrets(definition)
    if (!secretScan.clean) {
      validationResult.valid = false
      for (let i = 0; i < secretScan.flaggedPaths.length; i++) {
        validationResult.errors.push({
          code: 'RAW_SECRET_DETECTED',
          message: `Raw secret at "${secretScan.flaggedPaths[i]}" (${secretScan.patterns[i] ?? 'unknown'})`,
          field: secretScan.flaggedPaths[i],
        })
      }
    }

    if (validationResult.valid) {
      const db = getControlDb()
      await db
        .update(workflowCompositions)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(workflowCompositions.id, id))

      await this.auditService.appendEvent({
        eventType: 'composition.activated',
        entityType: 'workflow_composition',
        entityId: id,
        actorType: 'user',
        actorId: userId ?? 'system',
        details: { warningCount: validationResult.warnings.length },
      })

      logger.info('Workflow composition activated', { id })
    } else {
      logger.warn('Workflow composition activation failed — validation errors', {
        id,
        errorCount: validationResult.errors.length,
      })
    }

    return {
      valid: validationResult.valid,
      errors: validationResult.errors,
    }
  }

  async deactivate(id: string, userId?: string): Promise<void> {
    const existing = await this.get(id)
    if (!existing) {
      throw new Error(`Workflow composition not found: ${id}`)
    }

    const db = getControlDb()
    await db
      .update(workflowCompositions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(workflowCompositions.id, id))

    await this.auditService.appendEvent({
      eventType: 'composition.deactivated',
      entityType: 'workflow_composition',
      entityId: id,
      actorType: 'user',
      actorId: userId ?? 'system',
      details: {},
    })

    logger.info('Workflow composition deactivated', { id })
  }

  // ─── Execution ─────────────────────────────────────────────────────────

  async execute(
    id: string,
    triggerData?: Record<string, unknown>,
    userId?: string,
    agentId?: string,
    agentConfidence?: number,
  ): Promise<WorkflowInstance> {
    const existing = await this.get(id)
    if (!existing) {
      throw new Error(`Workflow composition not found: ${id}`)
    }

    if (!existing.isActive) {
      throw new Error('Cannot execute an inactive workflow composition. Activate it first.')
    }

    const db = getControlDb()
    const definition = existing.definition as unknown as CompositionDefinition
    const domain = definition.category ?? 'general'

    const workflowTools = definition.steps
      .filter((s) => s.type === 'tool' && s.tool)
      .map((s) => s.tool!)
    const toolCount = new Set(workflowTools).size
    const policyEvaluation = this.policyService.evaluate(workflowTools, domain, {
      records: definition.steps.length,
      emails: 0,
    })
    if (!policyEvaluation.allowed) {
      for (const v of policyEvaluation.violations) {
        workflowPolicyViolationsTotal.inc({ domain, violation_code: v.rule.type })
      }
      workflowExecutionTotal.inc({ workflow_id: id, domain, status: 'blocked' })
      const messages = policyEvaluation.violations.map((v) => v.message).join('; ')
      throw new Error(`Workflow execution blocked by policy: ${messages}`)
    }

    logger.info('Workflow pre-execution policy check passed', {
      compositionId: id,
      domain,
      toolCount,
      warnings: policyEvaluation.warnings.length,
    })

    let initialStatus: 'pending' | 'pending_approval' | 'running' = 'pending'
    if (agentId !== undefined && agentConfidence !== undefined) {
      const gate = await this.confidenceGateService.checkGate(
        agentId,
        'workflow_execution',
        agentConfidence,
        domain,
      )
      if (!gate.passed) {
        initialStatus = 'pending_approval'
        logger.warn('Workflow execution gated on confidence', {
          compositionId: id,
          agentId,
          domain,
          confidence: agentConfidence,
          requiredConfidence: gate.requiredConfidence,
          reason: gate.reason,
        })
      }
    }

    // Determine trigger type from the trigger data or default to 'manual'
    const triggerType = triggerData?.triggerType as string ?? 'manual'

    // Create workflow instance
    const [instance] = await db
      .insert(workflowInstances)
      .values({
        workflowId: id,
        status: initialStatus,
        triggerType,
        triggerData: triggerData ?? {},
        state: {},
        startedAt: new Date(),
      })
      .returning()

    this.policyService.recordExecution(domain)
    workflowExecutionTotal.inc({ workflow_id: id, domain, status: initialStatus })
    workflowActiveExecutions.inc({ domain })

    if (initialStatus !== 'pending_approval') {
      await db
        .update(workflowInstances)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(workflowInstances.id, instance.id))
    }

    // Update execution stats on the composition
    await db
      .update(workflowCompositions)
      .set({
        executionCount: sql`${workflowCompositions.executionCount} + 1`,
        lastExecutedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowCompositions.id, id))

    // Record in audit log
    await this.auditService.appendEvent({
      eventType: 'composition.executed',
      entityType: 'workflow_composition',
      entityId: id,
      actorType: 'user',
      actorId: userId ?? 'system',
      details: {
        instanceId: instance.id,
        triggerType,
        stepsCount: definition.steps.length,
      },
    })

    logger.info('Workflow composition execution started', {
      compositionId: id,
      instanceId: instance.id,
      triggerType,
    })

    // Return the updated instance
    const [updated] = await db
      .select()
      .from(workflowInstances)
      .where(eq(workflowInstances.id, instance.id))

    return updated
  }

  async getExecutionHistory(id: string, limit = 50): Promise<WorkflowInstance[]> {
    const db = getControlDb()

    return db
      .select()
      .from(workflowInstances)
      .where(eq(workflowInstances.workflowId, id))
      .orderBy(desc(workflowInstances.createdAt))
      .limit(limit)
  }

  async getLatestInstanceState(compositionId: string): Promise<WorkflowInstance | null> {
    const db = getControlDb()

    const rows = await db
      .select()
      .from(workflowInstances)
      .where(and(
        eq(workflowInstances.workflowId, compositionId),
      ))
      .orderBy(desc(workflowInstances.updatedAt))
      .limit(1)

    return rows[0] ?? null
  }

  // ─── Testing helpers ───────────────────────────────────────────────────

  static resetInstance(): void {
    WorkflowCompositionService.instance = undefined as unknown as WorkflowCompositionService
  }
}
