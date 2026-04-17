import { logger } from '@uaip/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyRule =
  /** (1) Deny individual tools from being used at all. */
  | { type: 'deny_tool'; tool: string; reason: string }
  /** (2) Deny specific tool combinations (e.g. payment-initiation + external-webhook). */
  | { type: 'deny_combination'; tools: string[]; reason: string }
  /** (3) Blast-radius limits: cap production writes / financial impact / email blasts. */
  | {
      type: 'blast_radius_limit';
      maxRecords?: number;
      maxAmount?: number;
      maxEmails?: number;
    }
  /** (4) Rate limits: max executions per hour for a domain. */
  | { type: 'rate_limit'; maxExecutionsPerHour: number }
  /** (5) Approval gate: domain requires human sign-off before execution. */
  | { type: 'require_approval_for_domain'; domain: string; approvers: string[] }
  /** (6) Domain confidence threshold: block execution below minimum agent confidence. */
  | { type: 'confidence_threshold'; domain: string; minConfidence: number }
  /** (7) Secret reference enforcement: workflow inputs must use vault refs, not inline values. */
  | { type: 'secret_reference_required'; fieldPatterns: string[] }
  | { type: 'require_dry_run' }
  /** (8) Output schema validation: enforce declared output schema on all tool results. */
  | { type: 'require_schema_validation' };

export interface CompositionPolicy {
  id: string;
  name: string;
  rules: PolicyRule[];
  isActive: boolean;
}

export interface EstimatedBlastRadius {
  records?: number;
  amount?: number;
  emails?: number;
}

export interface PolicyViolation {
  policyId: string;
  policyName: string;
  rule: PolicyRule;
  message: string;
}

export interface PolicyWarning {
  policyId: string;
  policyName: string;
  rule: PolicyRule;
  message: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  violations: PolicyViolation[];
  warnings: PolicyWarning[];
}

// ---------------------------------------------------------------------------
// In-memory rate-limit tracking
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  timestamps: number[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * CompositionPolicyService evaluates workflow definitions against a set of
 * active composition policies. Policies contain rules such as deny-lists,
 * blast-radius limits, rate limits, and domain-specific approval requirements.
 *
 * The service is stateless with respect to policies — they are loaded from
 * config (or injected). Rate-limit counters are tracked in-memory per
 * workflow domain.
 */
export class CompositionPolicyService {
  private static instance: CompositionPolicyService;

  /** Active policies loaded from config or DB */
  private policies: CompositionPolicy[] = [];

  /** Rate-limit counters keyed by `${domain}` */
  private rateLimitCounters: Map<string, RateLimitEntry> = new Map();

  constructor(policies?: CompositionPolicy[]) {
    if (policies) {
      this.policies = policies;
    }
  }

  static getInstance(): CompositionPolicyService {
    if (!CompositionPolicyService.instance) {
      CompositionPolicyService.instance = new CompositionPolicyService();
    }
    return CompositionPolicyService.instance;
  }

  // -------------------------------------------------------------------------
  // Policy Management
  // -------------------------------------------------------------------------

  /**
   * Load or replace the full set of policies.
   */
  loadPolicies(policies: CompositionPolicy[]): void {
    this.policies = policies;
    logger.info('Composition policies loaded', { count: policies.length });
  }

  /**
   * Add a single policy at runtime.
   */
  addPolicy(policy: CompositionPolicy): void {
    this.policies.push(policy);
    logger.info('Composition policy added', { id: policy.id, name: policy.name });
  }

  /**
   * Remove a policy by ID.
   */
  removePolicy(policyId: string): boolean {
    const before = this.policies.length;
    this.policies = this.policies.filter((p) => p.id !== policyId);
    const removed = this.policies.length < before;
    if (removed) {
      logger.info('Composition policy removed', { policyId });
    }
    return removed;
  }

  /**
   * Return all currently loaded policies.
   */
  getPolicies(): CompositionPolicy[] {
    return [...this.policies];
  }

  // -------------------------------------------------------------------------
  // Evaluation
  // -------------------------------------------------------------------------

  evaluate(
    workflowTools: string[],
    domain: string,
    estimatedBlastRadius: EstimatedBlastRadius = {},
    domainConfidence?: number,
    workflowInputFields?: string[]
  ): PolicyEvaluationResult {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyWarning[] = [];
    const activePolicies = this.policies.filter((p) => p.isActive);

    for (const policy of activePolicies) {
      for (const rule of policy.rules) {
        this.evaluateRule(
          policy,
          rule,
          workflowTools,
          domain,
          estimatedBlastRadius,
          violations,
          warnings,
          domainConfidence,
          workflowInputFields
        );
      }
    }

    const allowed = violations.length === 0;

    logger.info('Composition policy evaluation complete', {
      domain,
      toolCount: workflowTools.length,
      policiesEvaluated: activePolicies.length,
      violations: violations.length,
      warnings: warnings.length,
      allowed,
    });

    return { allowed, violations, warnings };
  }

  /**
   * Record a workflow execution for rate-limit tracking.
   * Call this after a workflow is actually dispatched.
   */
  recordExecution(domain: string): void {
    const entry = this.rateLimitCounters.get(domain) || { timestamps: [] };
    entry.timestamps.push(Date.now());
    this.rateLimitCounters.set(domain, entry);
  }

  // -------------------------------------------------------------------------
  // Rule Evaluators
  // -------------------------------------------------------------------------

  private evaluateRule(
    policy: CompositionPolicy,
    rule: PolicyRule,
    workflowTools: string[],
    domain: string,
    blast: EstimatedBlastRadius,
    violations: PolicyViolation[],
    warnings: PolicyWarning[],
    domainConfidence?: number,
    workflowInputFields?: string[]
  ): void {
    switch (rule.type) {
      case 'deny_tool':
        this.evaluateDenyTool(policy, rule, workflowTools, violations);
        break;
      case 'deny_combination':
        this.evaluateDenyCombination(policy, rule, workflowTools, violations);
        break;
      case 'require_approval_for_domain':
        this.evaluateRequireApproval(policy, rule, domain, warnings);
        break;
      case 'blast_radius_limit':
        this.evaluateBlastRadius(policy, rule, blast, violations);
        break;
      case 'rate_limit':
        this.evaluateRateLimit(policy, rule, domain, violations);
        break;
      case 'confidence_threshold':
        this.evaluateConfidenceThreshold(policy, rule, domain, domainConfidence, violations);
        break;
      case 'secret_reference_required':
        this.evaluateSecretReferenceRequired(policy, rule, workflowInputFields ?? [], violations);
        break;
      case 'require_dry_run':
        warnings.push({
          policyId: policy.id,
          policyName: policy.name,
          rule,
          message: 'Policy requires a dry-run before live execution.',
        });
        break;
      case 'require_schema_validation':
        warnings.push({
          policyId: policy.id,
          policyName: policy.name,
          rule,
          message: 'Policy requires schema validation of all inputs/outputs.',
        });
        break;
    }
  }

  /**
   * Deny-combination: if all tools in the deny list appear in the workflow, reject.
   */
  private evaluateDenyCombination(
    policy: CompositionPolicy,
    rule: Extract<PolicyRule, { type: 'deny_combination' }>,
    workflowTools: string[],
    violations: PolicyViolation[]
  ): void {
    const toolSet = new Set(workflowTools);
    const allPresent = rule.tools.every((t) => toolSet.has(t));

    if (allPresent) {
      violations.push({
        policyId: policy.id,
        policyName: policy.name,
        rule,
        message: `Denied tool combination: [${rule.tools.join(', ')}]. Reason: ${rule.reason}`,
      });
    }
  }

  /**
   * Require-approval: if the workflow domain matches, emit a warning with approvers.
   */
  private evaluateRequireApproval(
    policy: CompositionPolicy,
    rule: Extract<PolicyRule, { type: 'require_approval_for_domain' }>,
    domain: string,
    warnings: PolicyWarning[]
  ): void {
    if (domain.toLowerCase() === rule.domain.toLowerCase()) {
      warnings.push({
        policyId: policy.id,
        policyName: policy.name,
        rule,
        message: `Domain "${domain}" requires approval from: ${rule.approvers.join(', ')}`,
      });
    }
  }

  /**
   * Blast-radius: check estimated impact against configured limits.
   */
  private evaluateBlastRadius(
    policy: CompositionPolicy,
    rule: Extract<PolicyRule, { type: 'blast_radius_limit' }>,
    blast: EstimatedBlastRadius,
    violations: PolicyViolation[]
  ): void {
    const breaches: string[] = [];

    if (rule.maxRecords !== undefined && blast.records !== undefined) {
      if (blast.records > rule.maxRecords) {
        breaches.push(`records ${blast.records} > limit ${rule.maxRecords}`);
      }
    }

    if (rule.maxAmount !== undefined && blast.amount !== undefined) {
      if (blast.amount > rule.maxAmount) {
        breaches.push(`amount ${blast.amount} > limit ${rule.maxAmount}`);
      }
    }

    if (rule.maxEmails !== undefined && blast.emails !== undefined) {
      if (blast.emails > rule.maxEmails) {
        breaches.push(`emails ${blast.emails} > limit ${rule.maxEmails}`);
      }
    }

    if (breaches.length > 0) {
      violations.push({
        policyId: policy.id,
        policyName: policy.name,
        rule,
        message: `Blast radius exceeded: ${breaches.join('; ')}`,
      });
    }
  }

  /**
   * Rate-limit: check executions in the past hour for the given domain.
   */
  private evaluateRateLimit(
    policy: CompositionPolicy,
    rule: Extract<PolicyRule, { type: 'rate_limit' }>,
    domain: string,
    violations: PolicyViolation[]
  ): void {
    const entry = this.rateLimitCounters.get(domain);
    if (!entry) return;

    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    // Prune stale timestamps
    entry.timestamps = entry.timestamps.filter((ts) => ts > oneHourAgo);
    this.rateLimitCounters.set(domain, entry);

    if (entry.timestamps.length >= rule.maxExecutionsPerHour) {
      violations.push({
        policyId: policy.id,
        policyName: policy.name,
        rule,
        message: `Rate limit exceeded for domain "${domain}": ${entry.timestamps.length}/${rule.maxExecutionsPerHour} executions in the past hour.`,
      });
    }
  }

  private evaluateDenyTool(
    policy: CompositionPolicy,
    rule: Extract<PolicyRule, { type: 'deny_tool' }>,
    workflowTools: string[],
    violations: PolicyViolation[]
  ): void {
    if (workflowTools.includes(rule.tool)) {
      violations.push({
        policyId: policy.id,
        policyName: policy.name,
        rule,
        message: `Tool "${rule.tool}" is denied. Reason: ${rule.reason}`,
      });
    }
  }

  private evaluateConfidenceThreshold(
    policy: CompositionPolicy,
    rule: Extract<PolicyRule, { type: 'confidence_threshold' }>,
    domain: string,
    domainConfidence: number | undefined,
    violations: PolicyViolation[]
  ): void {
    if (domain.toLowerCase() !== rule.domain.toLowerCase()) return;
    if (domainConfidence === undefined) {
      violations.push({
        policyId: policy.id,
        policyName: policy.name,
        rule,
        message: `Domain "${domain}" requires confidence ≥ ${rule.minConfidence} but no confidence score was provided.`,
      });
      return;
    }
    if (domainConfidence < rule.minConfidence) {
      violations.push({
        policyId: policy.id,
        policyName: policy.name,
        rule,
        message: `Domain "${domain}" confidence ${domainConfidence.toFixed(3)} is below minimum ${rule.minConfidence}.`,
      });
    }
  }

  private evaluateSecretReferenceRequired(
    policy: CompositionPolicy,
    rule: Extract<PolicyRule, { type: 'secret_reference_required' }>,
    workflowInputFields: string[],
    violations: PolicyViolation[]
  ): void {
    const VAULT_REF_PREFIX = 'vault:';
    const bare: string[] = [];
    for (const field of workflowInputFields) {
      const matchesPattern = rule.fieldPatterns.some((pattern) => {
        if (pattern.endsWith('*')) {
          return field.startsWith(pattern.slice(0, -1));
        }
        return field === pattern;
      });
      if (matchesPattern && !field.startsWith(VAULT_REF_PREFIX)) {
        bare.push(field);
      }
    }
    if (bare.length > 0) {
      violations.push({
        policyId: policy.id,
        policyName: policy.name,
        rule,
        message: `Fields must use vault references (vault:...) but found inline values: ${bare.join(', ')}`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  clearRateLimitCounters(): void {
    this.rateLimitCounters.clear();
  }

  /**
   * Reset the singleton (for testing).
   */
  static resetInstance(): void {
    CompositionPolicyService.instance = undefined as unknown as CompositionPolicyService;
  }
}
