import crypto from 'crypto';
const uuidv4 = () => crypto.randomUUID();
import { logger } from '@uaip/utils';
import type { EventBusService } from '@uaip/shared-services';
import { CompositionPolicyService } from '@uaip/shared-services';
import type {
  EventBusHandler,
  CompositionDefinition,
  CompositionWorkflowStep,
  InputBinding,
  WorkflowUIProjection,
  ApprovalPolicy,
} from '@uaip/types';
import { CompositionReplayBuffer } from './composition_replay_buffer';

// ============================================================================
// Types
// ============================================================================

export interface ToolSummary {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface DAGResponseStep {
  id: string;
  name: string;
  description: string;
  type: CompositionWorkflowStep['type'];
  tool?: string;
  dependsOn: string[];
}

interface BindingResponseEntry {
  stepId: string;
  input: Record<string, InputBinding>;
}

function extractEventData<T extends object>(eventMessage: unknown): Partial<T> {
  if (
    typeof eventMessage !== 'object' ||
    eventMessage === null ||
    !('data' in eventMessage)
  ) {
    return {};
  }
  if (typeof eventMessage.data !== 'object' || eventMessage.data === null) {
    return {};
  }
  return eventMessage.data as Partial<T>;
}

// ============================================================================
// AgentWorkflowComposer — 4-Phase Composition Pipeline
//
// Phase 1: DAG Generation (LLM)
// Phase 2: Input Binding Resolution (LLM per step)
// Phase 3: Policy Application (deterministic)
// Phase 4: UI Projection Generation (LLM)
// ============================================================================

export class AgentWorkflowComposer {
  private policyService: CompositionPolicyService;
  private replayBuffer: CompositionReplayBuffer;

  constructor(
    private eventBus: EventBusService,
    policyService?: CompositionPolicyService,
    replayBuffer?: CompositionReplayBuffer
  ) {
    this.policyService = policyService ?? CompositionPolicyService.getInstance();
    this.replayBuffer = replayBuffer ?? new CompositionReplayBuffer();
  }

  // --------------------------------------------------------------------------
  // Main Entry: Compose a full CompositionDefinition from intent + tools
  // --------------------------------------------------------------------------

  async compose(
    intent: string,
    availableTools: ToolSummary[]
  ): Promise<CompositionDefinition> {
    const compositionId = uuidv4();
    const toolNames = availableTools.map((t) => t.name);

    logger.info('[AgentWorkflowComposer] Starting composition', {
      compositionId,
      intent,
      toolCount: availableTools.length,
    });

    try {
      // Phase 1 — DAG Generation
      const rawSteps = await this.generateDAG(intent, availableTools);

      // Phase 2 — Input Binding Resolution
      const boundSteps = await this.resolveBindings(rawSteps, availableTools);

      // Phase 3 — Policy Application (deterministic)
      const domain = this.inferDomain(intent, toolNames);
      let definition: Partial<CompositionDefinition> = {
        id: compositionId,
        name: this.deriveName(intent),
        description: intent,
        version: '1.0.0',
        author: 'agent',
        tags: this.deriveTags(intent, toolNames),
        category: domain,
        isPublic: false,
        agentPersona: 'workflow-composer',
        triggers: [{ type: 'intent', patterns: [intent] }],
        mcpServers: [],
        steps: boundSteps,
        inputSchema: {},
        outputSchema: {},
        stateSchema: {},
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      definition = this.applyPolicies(definition, domain);

      // Phase 4 — UI Projection Generation
      const ui = await this.generateUIProjection(boundSteps, intent);
      definition.ui = ui;

      const result = definition as CompositionDefinition;

      // Record success in replay buffer
      await this.replayBuffer.record({
        id: uuidv4(),
        intent,
        tools: toolNames,
        definition: result,
        outcome: 'success',
        createdAt: new Date(),
      });

      logger.info('[AgentWorkflowComposer] Composition complete', {
        compositionId,
        stepCount: boundSteps.length,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Record failure in replay buffer
      await this.replayBuffer.record({
        id: uuidv4(),
        intent,
        tools: toolNames,
        definition: null,
        outcome: 'failure',
        failureType: this.classifyError(error),
        failureDetails: message,
        createdAt: new Date(),
      }).catch((recordErr) => {
        logger.warn('[AgentWorkflowComposer] Failed to record attempt', {
          error: recordErr instanceof Error ? recordErr.message : String(recordErr),
        });
      });

      logger.error('[AgentWorkflowComposer] Composition failed', {
        compositionId,
        intent,
        error: message,
      });
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Phase 1: DAG Generation
  // --------------------------------------------------------------------------

  async generateDAG(
    intent: string,
    tools: ToolSummary[]
  ): Promise<CompositionWorkflowStep[]> {
    logger.info('[AgentWorkflowComposer] Phase 1: Generating DAG');

    // Fetch similar past compositions for few-shot examples
    const examples = await this.replayBuffer.getSuccessfulExamples(
      tools.map((t) => t.name),
      3
    );

    const prompt = this.buildDAGPrompt(intent, tools, examples);
    const requestId = uuidv4();
    const rawResponse = await this.requestLLMCompletion(prompt, requestId);
    const parsed = this.parseJSONResponse<DAGResponseStep[]>(rawResponse);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('DAG generation returned empty or invalid response');
    }

    const steps: CompositionWorkflowStep[] = parsed.map((item) => ({
      id: item.id || uuidv4(),
      name: item.name,
      description: item.description || item.name,
      type: item.type || 'tool',
      tool: item.tool,
      dependsOn: item.dependsOn || [],
      input: {},
      onFailure: 'retry' as const,
      retryPolicy: { maxAttempts: 2, backoff: 'exponential' as const, delayMs: 1000 },
    }));

    this.validateDAGStructure(steps);

    logger.info('[AgentWorkflowComposer] Phase 1 complete', { stepCount: steps.length });
    return steps;
  }

  // --------------------------------------------------------------------------
  // Phase 2: Input Binding Resolution
  // --------------------------------------------------------------------------

  async resolveBindings(
    steps: CompositionWorkflowStep[],
    tools: ToolSummary[]
  ): Promise<CompositionWorkflowStep[]> {
    logger.info('[AgentWorkflowComposer] Phase 2: Resolving input bindings');

    const toolSchemaMap = new Map(tools.map((t) => [t.name, t.inputSchema]));
    const boundSteps = [...steps];

    for (let i = 0; i < boundSteps.length; i++) {
      const step = boundSteps[i];

      if (step.type !== 'tool' || !step.tool) {
        continue;
      }

      const schema = toolSchemaMap.get(step.tool);
      if (!schema) {
        logger.warn('[AgentWorkflowComposer] No schema found for tool', { tool: step.tool });
        continue;
      }

      // Try deterministic binding first (if all required inputs map to prior step outputs)
      const deterministicBindings = this.tryDeterministicBinding(step, boundSteps, schema);
      if (deterministicBindings) {
        boundSteps[i] = { ...step, input: deterministicBindings };
        continue;
      }

      // Fall back to LLM for complex binding resolution
      const prompt = this.buildBindingPrompt(step, boundSteps, schema);
      const requestId = uuidv4();

      try {
        const rawResponse = await this.requestLLMCompletion(prompt, requestId);
        const parsed = this.parseJSONResponse<BindingResponseEntry>(rawResponse);

        if (parsed && typeof parsed.input === 'object') {
          boundSteps[i] = { ...step, input: parsed.input };
        }
      } catch (error) {
        logger.warn('[AgentWorkflowComposer] Binding resolution failed for step, using empty bindings', {
          stepId: step.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('[AgentWorkflowComposer] Phase 2 complete');
    return boundSteps;
  }

  // --------------------------------------------------------------------------
  // Phase 3: Policy Application (deterministic — no LLM)
  // --------------------------------------------------------------------------

  applyPolicies(
    definition: Partial<CompositionDefinition>,
    domain: string
  ): Partial<CompositionDefinition> {
    logger.info('[AgentWorkflowComposer] Phase 3: Applying policies', { domain });

    const toolNames = (definition.steps ?? []).flatMap((s) => (s.tool ? [s.tool] : []));

    const evaluation = this.policyService.evaluate(toolNames, domain);

    // Build approval policy based on domain and policy evaluation
    const approvalPolicy: ApprovalPolicy = {
      default: 'auto',
    };

    // If there are policy warnings about required approvals, set to require
    const hasApprovalWarning = evaluation.warnings.some(
      (w) => w.rule.type === 'require_approval_for_domain'
    );
    if (hasApprovalWarning) {
      approvalPolicy.default = 'require';
    }

    // High-stakes domains always gate
    const highStakesDomains = ['finance', 'hr', 'legal', 'compliance', 'security'];
    if (highStakesDomains.includes(domain.toLowerCase())) {
      approvalPolicy.default = 'confidence-gated';
      approvalPolicy.confidenceThreshold = 0.85;
      approvalPolicy.highStakesOverride = true;
    }

    // If there are policy violations, mark steps that involve denied tools
    if (!evaluation.allowed) {
      logger.warn('[AgentWorkflowComposer] Policy violations detected', {
        violations: evaluation.violations.map((v) => v.message),
      });
    }

    // Apply dry-run warnings to steps
    const requiresDryRun = evaluation.warnings.some(
      (w) => w.rule.type === 'require_dry_run'
    );
    if (requiresDryRun && definition.steps) {
      for (const step of definition.steps) {
        if (step.type === 'tool') {
          step.requiresApproval = true;
          step.approvalMessage = 'Policy requires dry-run verification before execution.';
        }
      }
    }

    definition.approvalPolicy = approvalPolicy;

    logger.info('[AgentWorkflowComposer] Phase 3 complete', {
      approvalDefault: approvalPolicy.default,
      violations: evaluation.violations.length,
      warnings: evaluation.warnings.length,
    });

    return definition;
  }

  // --------------------------------------------------------------------------
  // Phase 4: UI Projection Generation
  // --------------------------------------------------------------------------

  async generateUIProjection(
    steps: CompositionWorkflowStep[],
    intent: string
  ): Promise<WorkflowUIProjection> {
    logger.info('[AgentWorkflowComposer] Phase 4: Generating UI projection');

    const prompt = this.buildUIProjectionPrompt(steps, intent);
    const requestId = uuidv4();

    try {
      const rawResponse = await this.requestLLMCompletion(prompt, requestId);
      const parsed = this.parseJSONResponse<Record<string, unknown>>(rawResponse);

      if (
        parsed &&
        Array.isArray(parsed['intentTriggers']) &&
        Array.isArray(parsed['blocks'])
      ) {
        logger.info('[AgentWorkflowComposer] Phase 4 complete');
        return parsed as unknown as WorkflowUIProjection;
      }
    } catch (error) {
      logger.warn('[AgentWorkflowComposer] UI projection LLM failed, using fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Fallback: generate a basic UI projection from step structure
    return this.buildFallbackUIProjection(steps, intent);
  }

  // --------------------------------------------------------------------------
  // LLM Communication (mirrors TaskDAGService pattern)
  // --------------------------------------------------------------------------

  private async requestLLMCompletion(prompt: string, requestId: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const responseEvent = `llm.completion.response.${requestId}`;
      const timeoutMs = 60000;

      const responseHandler: EventBusHandler = async (eventMessage) => {
        clearTimeout(timeout);
        void this.eventBus.unsubscribe(responseEvent, responseHandler);

        const data = extractEventData<{ content?: string; error?: string }>(eventMessage);

        if (data.error) {
          reject(new Error(data.error));
          return;
        }

        resolve(data.content ?? '');
      };

      const timeout = setTimeout(() => {
        void this.eventBus.unsubscribe(responseEvent, responseHandler);
        reject(new Error('LLM completion request timed out'));
      }, timeoutMs);

      void this.eventBus.subscribe(responseEvent, responseHandler);

      this.eventBus.publish('llm.completion.request', {
        requestId,
        prompt,
        responseEvent,
        options: {
          temperature: 0.3,
          maxTokens: 4096,
        },
      });
    });
  }

  // --------------------------------------------------------------------------
  // Prompt Builders
  // --------------------------------------------------------------------------

  private buildDAGPrompt(
    intent: string,
    tools: ToolSummary[],
    examples: Array<{ intent: string; definition: CompositionDefinition | null }>
  ): string {
    const toolList = tools
      .map((t) => `- **${t.name}**: ${t.description}\n  inputSchema: ${JSON.stringify(t.inputSchema)}`)
      .join('\n');

    let examplesSection = '';
    if (examples.length > 0) {
      examplesSection = '\n## Successful Past Compositions (few-shot examples)\n';
      for (const ex of examples) {
        if (ex.definition?.steps) {
          const stepSummary = ex.definition.steps.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            tool: s.tool,
            dependsOn: s.dependsOn,
          }));
          examplesSection += `\nIntent: "${ex.intent}"\nSteps: ${JSON.stringify(stepSummary, null, 2)}\n`;
        }
      }
    }

    return `You are a workflow composition engine. Given a user intent and available MCP tools, produce an execution DAG as JSON.

## Instructions
- Return a JSON array of step objects.
- Each step has: "id" (unique string), "name" (short label), "description" (what this step does), "type" (one of: "tool", "agent-reason", "approval", "conditional", "parallel", "transform", "wait"), "tool" (tool name, required if type is "tool"), "dependsOn" (array of step IDs that must complete first).
- Steps should be atomic and independently executable where possible.
- Maximize parallelism: only add a dependency if the step truly needs the output of another.
- Do NOT include wrapper text. Return ONLY a valid JSON array.
${examplesSection}
## Available Tools
${toolList}

## User Intent
${intent}

## Response Format
\`\`\`json
[
  {
    "id": "step_1",
    "name": "Fetch data",
    "description": "Retrieve data using the source tool",
    "type": "tool",
    "tool": "tool_name",
    "dependsOn": []
  }
]
\`\`\``;
  }

  private buildBindingPrompt(
    step: CompositionWorkflowStep,
    allSteps: CompositionWorkflowStep[],
    toolSchema: Record<string, unknown>
  ): string {
    const deps = step.dependsOn ?? [];
    const priorSteps = allSteps
      .filter((s) => s.id !== undefined && deps.includes(s.id))
      .map((s) => ({ id: s.id, name: s.name, tool: s.tool, output: s.output }));

    return `You are resolving input bindings for a workflow step.

## Step
- id: "${step.id}"
- name: "${step.name}"
- tool: "${step.tool}"
- dependsOn: ${JSON.stringify(step.dependsOn)}

## Tool Input Schema
${JSON.stringify(toolSchema, null, 2)}

## Prior Steps (available data sources)
${JSON.stringify(priorSteps, null, 2)}

## Instructions
For each required input in the tool schema, create an InputBinding:
- { "ref": "step", "stepId": "<prior_step_id>", "path": "<json_path>" } — reference output of a prior step
- { "ref": "trigger", "path": "<json_path>" } — reference trigger data
- { "ref": "literal", "value": <default_value> } — use a literal default
- { "ref": "agent", "prompt": "<question>" } — ask the agent to resolve at runtime

Return a JSON object: { "stepId": "${step.id}", "input": { "<param_name>": <InputBinding>, ... } }
Do NOT include wrapper text. Return ONLY valid JSON.`;
  }

  private buildUIProjectionPrompt(
    steps: CompositionWorkflowStep[],
    intent: string
  ): string {
    const stepSummary = steps.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      tool: s.tool,
      requiresApproval: s.requiresApproval,
    }));

    return `You are generating a v2 UI projection for a workflow in the Telescope interface.

## Workflow Intent
${intent}

## Steps
${JSON.stringify(stepSummary, null, 2)}

## Instructions

Generate a WorkflowUIProjection JSON object. Use version:1 schema (v1 for backward compat):

- "version": 1
- "intentTriggers": array of short phrases that activate this workflow (3-5 phrases)
- "constellation": { "icon": emoji, "color": hex color, "category": domain category }
- "blocks": array of block objects per step. Each block MUST include:
  - "stepId": the step ID string
  - "display": one of "card"|"status-badge"|"form"|"chart"|"table"|"timeline"|"approval-prompt"|"custom-url"
  - "title": human-readable step name
  - "fields": array of field projections. Use token-aware keys:
    - { "key": "$state.<stepId>.fieldName", "label": "Human Label", "type": "text"|"number"|"currency"|"date"|"status"|"link"|"badge"|"progress" }
    - The "key" MUST start with "$state." to reference live workflow state
  - "actions": array of action projections (REQUIRED for every block, include at minimum a status action):
    - Valid types: "approve"|"reject"|"retry"|"skip"|"custom"
    - Each action MUST have: { "label": string, "type": string, "stepId": string }
    - For approval steps: include BOTH "approve" and "reject" actions
    - For regular steps: include "retry" and optionally "skip"
    - Never emit an empty actions array — always provide at least one action
- "expressions": { "idle": "calm", "running": "working", "waitingApproval": "attentive", "completed": "satisfied", "failed": "alarmed" }
- "ambient": { "showInMorningOpen": boolean, "attentionWeight": 0.0–1.0, "whisperTemplate": optional string template }

## Token Reference Rules
- Field keys MUST use "$state.stepId.fieldName" path syntax (not raw field names)
- Use descriptive labels that match the data semantics
- For currency fields: type:"currency", format:"USD"
- For date fields: type:"date"
- For status indicators: type:"status"

Return ONLY valid JSON. No wrapper text, no markdown, no explanation.`;
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private tryDeterministicBinding(
    step: CompositionWorkflowStep,
    allSteps: CompositionWorkflowStep[],
    schema: Record<string, unknown>
  ): Record<string, InputBinding> | null {
    // Only attempt deterministic binding for simple schemas with properties
    const properties = (schema as { properties?: Record<string, unknown> }).properties;
    if (!properties || Object.keys(properties).length === 0) {
      return null;
    }

    const dependsOn = step.dependsOn ?? [];

    // If no dependencies, all inputs must come from trigger
    if (dependsOn.length === 0) {
      const bindings: Record<string, InputBinding> = {};
      for (const key of Object.keys(properties)) {
        bindings[key] = { ref: 'trigger', path: key };
      }
      return bindings;
    }

    // If single dependency and schema keys match output paths, bind deterministically
    if (dependsOn.length === 1) {
      const depId = dependsOn[0];
      const bindings: Record<string, InputBinding> = {};
      for (const key of Object.keys(properties)) {
        bindings[key] = { ref: 'step', stepId: depId, path: `result.${key}` };
      }
      return bindings;
    }

    // Complex cases: defer to LLM
    return null;
  }

  private validateDAGStructure(steps: CompositionWorkflowStep[]): void {
    const ids = new Set<string>();
    for (const step of steps) {
      if (!step.id) throw new Error('Workflow step is missing an id');
      ids.add(step.id);
    }

    // Check for duplicate IDs
    if (ids.size !== steps.length) {
      throw new Error('DAG contains duplicate step IDs');
    }

    // Check dependency references
    for (const step of steps) {
      for (const dep of (step.dependsOn ?? [])) {
        if (!ids.has(dep)) {
          throw new Error(`Step "${step.id}" depends on non-existent step "${dep}"`);
        }
      }
    }

    // Check for cycles via DFS
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const adj = new Map<string, string[]>();
    for (const step of steps) {
      if (!step.id) throw new Error('Workflow step is missing an id');
      adj.set(step.id, []);
    }
    for (const step of steps) {
      if (!step.id) throw new Error('Workflow step is missing an id');
      for (const dep of (step.dependsOn ?? [])) {
        adj.get(dep)?.push(step.id);
      }
    }

    const hasCycle = (nodeId: string): boolean => {
      if (visiting.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visiting.add(nodeId);
      for (const neighbor of adj.get(nodeId) ?? []) {
        if (hasCycle(neighbor)) return true;
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
      return false;
    };

    for (const step of steps) {
      if (!step.id) throw new Error('Workflow step is missing an id');
      if (!visited.has(step.id) && hasCycle(step.id)) {
        throw new Error('DAG contains a cycle');
      }
    }

    // Must have at least one root node
    const hasRoot = steps.some((s) => (s.dependsOn ?? []).length === 0);
    if (!hasRoot) {
      throw new Error('DAG has no root node (every step has dependencies)');
    }
  }

  private parseJSONResponse<T>(raw: string): T {
    let jsonStr = raw.trim();
    const fencedMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fencedMatch) {
      jsonStr = fencedMatch[1].trim();
    }

    try {
      return JSON.parse(jsonStr) as T;
    } catch {
      throw new Error(`Failed to parse LLM response as JSON: ${jsonStr.slice(0, 200)}`);
    }
  }

  private inferDomain(intent: string, toolNames: string[]): string {
    const intentLower = intent.toLowerCase();
    const allText = `${intentLower} ${toolNames.join(' ').toLowerCase()}`;

    const domainKeywords: Record<string, string[]> = {
      finance: ['invoice', 'payment', 'billing', 'stripe', 'quickbooks', 'tax', 'accounting', 'revenue'],
      hr: ['employee', 'onboard', 'payroll', 'bamboo', 'gusto', 'hiring', 'recruit'],
      legal: ['contract', 'compliance', 'regulation', 'legal', 'audit'],
      marketing: ['campaign', 'email', 'newsletter', 'mailchimp', 'hubspot', 'analytics'],
      engineering: ['deploy', 'build', 'test', 'ci', 'pipeline', 'github', 'jira'],
      support: ['ticket', 'support', 'customer', 'zendesk', 'intercom', 'helpdesk'],
      security: ['access', 'permission', 'auth', 'vulnerability', 'scan'],
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some((kw) => allText.includes(kw))) {
        return domain;
      }
    }

    return 'general';
  }

  private deriveName(intent: string): string {
    // Take first 60 chars, capitalize first letter
    const name = intent.length > 60 ? intent.slice(0, 57) + '...' : intent;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  private deriveTags(intent: string, toolNames: string[]): string[] {
    const tags = new Set<string>();
    tags.add('auto-composed');
    for (const tool of toolNames) {
      tags.add(tool.split('.')[0]); // e.g., "stripe.invoices.create" → "stripe"
    }
    return Array.from(tags).slice(0, 10);
  }

  private buildFallbackUIProjection(
    steps: CompositionWorkflowStep[],
    intent: string
  ): WorkflowUIProjection {
    const blocks = steps.map((step) => ({
      stepId: step.id,
      display: step.type === 'approval' ? 'approval-prompt' as const : 'card' as const,
      title: step.name,
      fields: [
        { key: 'status', label: 'Status', type: 'status' as const },
      ],
    }));

    return {
      intentTriggers: [intent.slice(0, 50)],
      constellation: {
        icon: '⚙️',
        color: '#6366f1',
        category: 'workflow',
      },
      blocks,
      expressions: {
        idle: 'calm',
        running: 'working',
        waitingApproval: 'attentive',
        completed: 'satisfied',
        failed: 'alarmed',
      },
      ambient: {
        showInMorningOpen: false,
        attentionWeight: 0.5,
      },
    };
  }

  private classifyError(
    error: unknown
  ): 'structural' | 'binding' | 'semantic' | 'runtime' {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('cycle') || message.includes('root node') || message.includes('duplicate')) {
      return 'structural';
    }
    if (message.includes('binding') || message.includes('schema')) {
      return 'binding';
    }
    if (message.includes('parse') || message.includes('JSON')) {
      return 'semantic';
    }
    return 'runtime';
  }
}
