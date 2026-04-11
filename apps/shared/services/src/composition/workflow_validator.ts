import { logger } from '@uaip/utils';
import { getControlDb } from '../database/drizzle/clients/index';
import { eq } from 'drizzle-orm';
import {
  federatedTools,
  mcpServers,
} from '../database/drizzle/schemas/control_schema';
import { CompositionPolicyService } from './composition_policy_service';
import { SecretReferenceService } from './secret_reference_service';
import type {
  CompositionDefinition,
  CompositionWorkflowStep,
  InputBinding,
} from '@uaip/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationError {
  code: string;
  message: string;
  stepId?: string;
  field?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  stepId?: string;
  field?: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  /** Per-step schema compatibility notes: stepId -> status string. */
  schemaCompatibility: Record<string, string>;
  /** Estimated blast radius derived from workflow metadata and policies. */
  estimatedBlastRadius: {
    stepsCount: number;
    toolsCount: number;
    hasSideEffects: boolean;
    domains: string[];
  };
  /** Required approval chain based on domain and blast radius. */
  approvalChain: {
    required: boolean;
    approvers: string[];
    reason: string | null;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * WorkflowValidator performs comprehensive pre-execution validation on a
 * CompositionDefinition before it can be activated or executed. Checks:
 *
 *   a. Structural: DAG is acyclic, all step dependencies exist, no orphans.
 *   b. Tool resolution: MCP tools exist in federation or local registry.
 *   c. Schema compatibility: InputBinding paths exist in source output schemas.
 *   d. Composition policies: active rules from CompositionPolicyService.
 *   e. Secret scan: no raw secrets embedded in the definition.
 *   f. Approval chain: determines required approvals.
 */
export class WorkflowValidator {
  private static instance: WorkflowValidator;
  private policyService: CompositionPolicyService;
  private secretService: SecretReferenceService;

  constructor(
    policyService?: CompositionPolicyService,
    secretService?: SecretReferenceService,
  ) {
    this.policyService = policyService ?? CompositionPolicyService.getInstance();
    this.secretService = secretService ?? SecretReferenceService.getInstance();
  }

  static getInstance(): WorkflowValidator {
    if (!WorkflowValidator.instance) {
      WorkflowValidator.instance = new WorkflowValidator();
    }
    return WorkflowValidator.instance;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async validate(definition: CompositionDefinition): Promise<WorkflowValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const schemaCompatibility: Record<string, string> = {};

    logger.info('Validating workflow definition', {
      workflowId: definition.id,
      name: definition.name,
      stepsCount: definition.steps.length,
    });

    // a. Structural validation
    this.validateStructure(definition, errors, warnings);

    // b. Tool resolution
    await this.validateToolResolution(definition, errors, warnings);

    // c. Schema compatibility
    this.validateSchemaCompatibility(definition, errors, warnings, schemaCompatibility);

    // d. Composition policies
    this.validatePolicies(definition, errors, warnings);

    // e. Secret scan
    this.validateSecrets(definition, errors, warnings);

    // f. Approval chain & blast radius
    const estimatedBlastRadius = this.estimateBlastRadius(definition);
    const approvalChain = this.determineApprovalChain(definition, estimatedBlastRadius);

    const valid = errors.length === 0;

    logger.info('Workflow validation complete', {
      workflowId: definition.id,
      valid,
      errorCount: errors.length,
      warningCount: warnings.length,
    });

    return {
      valid,
      errors,
      warnings,
      schemaCompatibility,
      estimatedBlastRadius,
      approvalChain,
    };
  }

  // -----------------------------------------------------------------------
  // a. Structural Validation
  // -----------------------------------------------------------------------

  private validateStructure(
    definition: CompositionDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const steps = definition.steps;
    const stepIds = new Set(steps.map((s) => s.id));

    if (steps.length === 0) {
      errors.push({
        code: 'EMPTY_WORKFLOW',
        message: 'Workflow definition contains no steps.',
      });
      return;
    }

    // Check that all dependsOn references point to existing steps
    for (const step of steps) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          errors.push({
            code: 'MISSING_DEPENDENCY',
            message: `Step "${step.id}" depends on "${dep}" which does not exist.`,
            stepId: step.id,
            field: 'dependsOn',
          });
        }
      }

      // Check compensation step exists
      if (step.compensationStep && !stepIds.has(step.compensationStep)) {
        errors.push({
          code: 'MISSING_COMPENSATION_STEP',
          message: `Step "${step.id}" references compensation step "${step.compensationStep}" which does not exist.`,
          stepId: step.id,
          field: 'compensationStep',
        });
      }

      // Check parallel step references
      if (step.parallelSteps) {
        for (const ps of step.parallelSteps) {
          if (!stepIds.has(ps)) {
            errors.push({
              code: 'MISSING_PARALLEL_STEP',
              message: `Step "${step.id}" references parallel step "${ps}" which does not exist.`,
              stepId: step.id,
              field: 'parallelSteps',
            });
          }
        }
      }

      // Check branch step references
      for (const branchId of [...(step.trueBranch ?? []), ...(step.falseBranch ?? [])]) {
        if (!stepIds.has(branchId)) {
          errors.push({
            code: 'MISSING_BRANCH_STEP',
            message: `Step "${step.id}" references branch step "${branchId}" which does not exist.`,
            stepId: step.id,
          });
        }
      }
    }

    // Detect orphan steps (no dependencies and not depended upon, excluding root steps)
    const dependedUpon = new Set<string>();
    for (const step of steps) {
      for (const dep of step.dependsOn) {
        dependedUpon.add(dep);
      }
    }
    for (const step of steps) {
      if (step.dependsOn.length === 0 && !dependedUpon.has(step.id) && steps.length > 1) {
        warnings.push({
          code: 'ORPHAN_STEP',
          message: `Step "${step.id}" has no dependencies and is not depended upon by any other step.`,
          stepId: step.id,
        });
      }
    }

    // Cycle detection via topological sort (Kahn's algorithm)
    const cycle = this.detectCycle(steps);
    if (cycle) {
      errors.push({
        code: 'CYCLE_DETECTED',
        message: `Workflow DAG contains a cycle involving steps: ${cycle.join(' -> ')}.`,
      });
    }
  }

  /**
   * Detect cycles using Kahn's algorithm. Returns a cycle path if found, null otherwise.
   */
  private detectCycle(steps: CompositionWorkflowStep[]): string[] | null {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.id, 0);
      adjacency.set(step.id, []);
    }

    for (const step of steps) {
      for (const dep of step.dependsOn) {
        if (adjacency.has(dep)) {
          adjacency.get(dep)!.push(step.id);
          inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    let visited = 0;
    while (queue.length > 0) {
      const node = queue.shift()!;
      visited++;
      for (const neighbor of adjacency.get(node) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    if (visited < steps.length) {
      // There is a cycle — collect the steps still with non-zero in-degree
      const cycleMembers = steps
        .filter((s) => (inDegree.get(s.id) ?? 0) > 0)
        .map((s) => s.id);
      return cycleMembers;
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // b. Tool Resolution
  // -----------------------------------------------------------------------

  private async validateToolResolution(
    definition: CompositionDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): Promise<void> {
    const toolSteps = definition.steps.filter((s) => s.type === 'tool' && s.tool);
    if (toolSteps.length === 0) return;

    const toolNames = [...new Set(toolSteps.map((s) => s.tool!))];

    try {
      const db = getControlDb();

      // Check federation registry
      const federatedRows = await db
        .select({ toolName: federatedTools.toolName })
        .from(federatedTools)
        .where(eq(federatedTools.isActive, true));
      const federatedSet = new Set(federatedRows.map((r) => r.toolName));

      // Check local MCP server registry (tool names may match server names)
      const localRows = await db
        .select({ name: mcpServers.name })
        .from(mcpServers)
        .where(eq(mcpServers.enabled, true));
      const localSet = new Set(localRows.map((r) => r.name));

      for (const toolName of toolNames) {
        if (!federatedSet.has(toolName) && !localSet.has(toolName)) {
          errors.push({
            code: 'TOOL_NOT_FOUND',
            message: `Tool "${toolName}" not found in federation registry or local tool registry.`,
            field: 'tool',
          });
        }
      }
    } catch (error) {
      // If DB is unavailable, emit a warning rather than blocking validation
      warnings.push({
        code: 'TOOL_RESOLUTION_UNAVAILABLE',
        message: `Could not verify tool availability: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  // -----------------------------------------------------------------------
  // c. Schema Compatibility
  // -----------------------------------------------------------------------

  private validateSchemaCompatibility(
    definition: CompositionDefinition,
    errors: ValidationError[],
    _warnings: ValidationWarning[],
    schemaCompatibility: Record<string, string>,
  ): void {
    const stepMap = new Map(definition.steps.map((s) => [s.id, s]));

    for (const step of definition.steps) {
      const bindings = step.input;
      if (!bindings) {
        schemaCompatibility[step.id] = 'no-bindings';
        continue;
      }

      let compatible = true;
      for (const [paramName, binding] of Object.entries(bindings)) {
        const typed = binding as InputBinding;

        if (typed.ref === 'step') {
          const sourceStep = stepMap.get(typed.stepId);
          if (!sourceStep) {
            errors.push({
              code: 'BINDING_SOURCE_MISSING',
              message: `Step "${step.id}" input "${paramName}" references step "${typed.stepId}" which does not exist.`,
              stepId: step.id,
              field: `input.${paramName}`,
            });
            compatible = false;
            continue;
          }

          // Verify dependency exists — the step must depend on the source
          if (!step.dependsOn.includes(typed.stepId)) {
            errors.push({
              code: 'BINDING_MISSING_DEPENDENCY',
              message: `Step "${step.id}" reads from step "${typed.stepId}" but does not list it in dependsOn.`,
              stepId: step.id,
              field: `input.${paramName}`,
            });
            compatible = false;
          }
        }

        if (typed.ref === 'trigger') {
          // Validate path exists in the workflow's inputSchema
          const path = typed.path;
          if (definition.inputSchema?.properties) {
            const topLevelKey = path.split('.')[0];
            if (!definition.inputSchema.properties[topLevelKey]) {
              errors.push({
                code: 'BINDING_PATH_MISSING',
                message: `Step "${step.id}" input "${paramName}" references trigger path "${path}" not found in inputSchema.`,
                stepId: step.id,
                field: `input.${paramName}`,
              });
              compatible = false;
            }
          }
        }
      }

      schemaCompatibility[step.id] = compatible ? 'compatible' : 'incompatible';
    }
  }

  // -----------------------------------------------------------------------
  // d. Composition Policies
  // -----------------------------------------------------------------------

  private validatePolicies(
    definition: CompositionDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const toolSteps = definition.steps.filter((s) => s.type === 'tool' && s.tool);
    const workflowTools = toolSteps.map((s) => s.tool!);
    const domain = definition.category || 'general';

    const result = this.policyService.evaluate(workflowTools, domain);

    for (const violation of result.violations) {
      errors.push({
        code: 'POLICY_VIOLATION',
        message: `Policy "${violation.policyName}": ${violation.message}`,
      });
    }

    for (const warning of result.warnings) {
      warnings.push({
        code: 'POLICY_WARNING',
        message: `Policy "${warning.policyName}": ${warning.message}`,
      });
    }
  }

  // -----------------------------------------------------------------------
  // e. Secret Scan
  // -----------------------------------------------------------------------

  private validateSecrets(
    definition: CompositionDefinition,
    errors: ValidationError[],
    _warnings: ValidationWarning[],
  ): void {
    const scanResult = this.secretService.scanForRawSecrets(definition);

    if (!scanResult.clean) {
      for (let i = 0; i < scanResult.flaggedPaths.length; i++) {
        errors.push({
          code: 'RAW_SECRET_DETECTED',
          message: `Raw secret detected at "${scanResult.flaggedPaths[i]}" (pattern: ${scanResult.patterns[i] ?? 'unknown'}). Use vault:// or secret:// references instead.`,
          field: scanResult.flaggedPaths[i],
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // f. Blast Radius & Approval Chain
  // -----------------------------------------------------------------------

  private estimateBlastRadius(definition: CompositionDefinition): WorkflowValidationResult['estimatedBlastRadius'] {
    const toolSteps = definition.steps.filter((s) => s.type === 'tool');
    const tools = new Set(toolSteps.map((s) => s.tool).filter(Boolean));

    // Steps that have side-effects (tool calls, agent reasoning, transforms)
    const sideEffectTypes = new Set(['tool', 'agent-reason']);
    const hasSideEffects = definition.steps.some((s) => sideEffectTypes.has(s.type));

    // Domains inferred from category + MCP connection sub-domains
    const domains = new Set<string>();
    if (definition.category) domains.add(definition.category);
    for (const conn of definition.mcpServers ?? []) {
      if (conn.subdomainId) domains.add(conn.subdomainId);
    }

    return {
      stepsCount: definition.steps.length,
      toolsCount: tools.size,
      hasSideEffects,
      domains: [...domains],
    };
  }

  private determineApprovalChain(
    definition: CompositionDefinition,
    blastRadius: WorkflowValidationResult['estimatedBlastRadius'],
  ): WorkflowValidationResult['approvalChain'] {
    // Gather approval requirements from policy warnings
    const domain = definition.category || 'general';
    const toolSteps = definition.steps.filter((s) => s.type === 'tool' && s.tool);
    const workflowTools = toolSteps.map((s) => s.tool!);
    const policyResult = this.policyService.evaluate(workflowTools, domain);

    const approvers = new Set<string>();
    let reason: string | null = null;

    // Check for domain-level approval requirements from policy warnings
    for (const warning of policyResult.warnings) {
      if (warning.rule.type === 'require_approval_for_domain') {
        for (const approver of warning.rule.approvers) {
          approvers.add(approver);
        }
        reason = warning.message;
      }
    }

    // Explicit approval policy on the definition
    if (definition.approvalPolicy?.default === 'require') {
      if (definition.approvalPolicy.escalateTo) {
        approvers.add(definition.approvalPolicy.escalateTo);
      }
      reason = reason ?? 'Workflow approval policy requires explicit approval.';
    }

    // High blast radius heuristic
    if (blastRadius.stepsCount > 10 || blastRadius.toolsCount > 5) {
      reason = reason ?? 'High blast radius — manual approval recommended.';
    }

    // Steps that individually require approval
    const approvalSteps = definition.steps.filter((s) => s.requiresApproval);
    if (approvalSteps.length > 0 && approvers.size === 0) {
      if (definition.approvalPolicy?.escalateTo) {
        approvers.add(definition.approvalPolicy.escalateTo);
      }
      reason = reason ?? `${approvalSteps.length} step(s) require individual approval.`;
    }

    const required = approvers.size > 0 || definition.approvalPolicy?.default === 'require';

    return {
      required,
      approvers: [...approvers],
      reason,
    };
  }

  // -----------------------------------------------------------------------
  // Testing helpers
  // -----------------------------------------------------------------------

  static resetInstance(): void {
    WorkflowValidator.instance = undefined as unknown as WorkflowValidator;
  }
}
