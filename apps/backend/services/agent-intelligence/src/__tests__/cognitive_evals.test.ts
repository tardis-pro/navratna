import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ActionRecommendationSchema,
  AgentAnalysisSchema,
  AgentRole,
  AgentSchema,
  AgentStatus,
  ExecutionPlanSchema,
  SecurityLevel,
  ToolCategory,
  type Agent,
  type AgentAnalysis,
  type ToolDefinition,
} from '@uaip/types';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/event_bus';
import { AgentPlanningService } from '../services/agent_planning_service.js';
import { DecisionEngine } from '@uaip/shared-services/decision-engine';
import type { CapabilityResolver } from '@uaip/shared-services/decision-engine';
import { AgentStateMachine } from '@uaip/shared-services/agent-state';

const createTool = (name: string): ToolDefinition => ({
  id: `${name}-id`,
  name,
  description: `${name} tool`,
  category: ToolCategory.ANALYSIS,
  parameters: { type: 'object', properties: {} },
  returnType: { type: 'object' },
  examples: [],
  securityLevel: SecurityLevel.MEDIUM,
  requiresApproval: false,
  dependencies: [],
  version: '1.0.0',
  author: 'test-suite',
  tags: ['eval'],
  isEnabled: true,
  executionTimeEstimate: 30,
});

const createAnalysis = (intent = 'create'): AgentAnalysis =>
  AgentAnalysisSchema.parse({
    analysis: {
      context: {
        messageCount: 4,
        participants: ['user', 'agent-1'],
        topics: ['planning'],
        sentiment: 'neutral',
        complexity: 'moderate',
        urgency: 'medium',
      },
      intent: {
        primary: intent,
        secondary: [],
        confidence: 0.82,
        entities: [],
        complexity: 'moderate',
      },
      agentCapabilities: {
        tools: ['search_tool'],
        artifacts: ['report'],
        specializations: ['analysis'],
        limitations: [],
      },
      environmentFactors: {
        timeOfDay: 10,
        userLoad: 0.25,
        systemLoad: 'low',
        availableResources: 'sufficient',
      },
    },
    recommendedActions: [],
    confidence: 0.78,
    explanation: 'Well-scoped request with clear objective.',
    timestamp: new Date('2026-03-01T10:00:00Z'),
  });

const createAgent = (): Agent =>
  AgentSchema.parse({
    id: 'agent-1',
    createdAt: new Date('2026-03-01T10:00:00Z'),
    updatedAt: new Date('2026-03-01T10:00:00Z'),
    name: 'Planner Agent',
    role: AgentRole.ASSISTANT,
    personaId: 'persona-1',
    intelligenceConfig: {
      analysisDepth: 'intermediate',
      contextWindowSize: 4096,
      decisionThreshold: 0.7,
      learningEnabled: true,
      collaborationMode: 'collaborative',
    },
    securityContext: {
      securityLevel: 'medium',
      allowedCapabilities: ['search_tool', 'writer_tool'],
      approvalRequired: false,
      auditLevel: 'standard',
    },
    status: AgentStatus.IDLE,
    capabilities: ['search_tool', 'writer_tool'],
    skills: [],
    version: 1,
    createdBy: 'user-1',
    isActive: true,
    assignedMCPTools: [],
  });

describe('Layer 3: Cognitive Evals', () => {
  let capabilityResolver: CapabilityResolver;
  let stateMachine: AgentStateMachine;
  let decisionEngine: DecisionEngine;

  beforeEach(() => {
    const tool = createTool('search_tool');
    capabilityResolver = {
      lookup: vi.fn(async (capability: string) => (capability === 'search_tool' ? tool : null)),
      validateCapabilities: vi.fn(async (requiredCapabilities: string[]) => ({
        valid: requiredCapabilities.every((capability) => capability === 'search_tool'),
        missing: requiredCapabilities.filter((capability) => capability !== 'search_tool'),
      })),
      getAvailableCapabilities: vi.fn(async () => ['search_tool']),
    };

    stateMachine = new AgentStateMachine('agent-1', ['search_tool']);
    decisionEngine = new DecisionEngine(capabilityResolver, stateMachine, undefined, 0.5);
  });

  it('returns confidence >= 0.5 for well-formed action inputs', async () => {
    const analysis = createAnalysis('analyze');
    const actions = [
      ActionRecommendationSchema.parse({
        type: 'tool_execution',
        confidence: 0.84,
        reasoning: 'Clear analytical request with direct tool match.',
        estimatedDuration: 120,
        requiredCapabilities: ['search_tool'],
        riskLevel: 'low',
      }),
    ];

    const result = await decisionEngine.selectAction(analysis, actions);

    expect(result.selectedAction).not.toBeNull();
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.resolvedCapabilities).toHaveLength(1);
  });

  it('generates core steps proportional to intent complexity', async () => {
    const publish = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({ success: false, data: null }));
    const subscribe = vi.fn(async () => undefined);

    // @ts-expect-error — test mock: partial stub satisfies DatabaseService for unit testing
    const mockDb153: DatabaseService = {};
    // @ts-expect-error — test mock: partial stub satisfies EventBusService for unit testing
    const mockEbs153: EventBusService = { publish, request, subscribe };
    const planningService = new AgentPlanningService({
      databaseService: mockDb153,
      eventBusService: mockEbs153,
      serviceName: 'agent-planning-test',
      securityLevel: 2,
    });

    vi.spyOn(planningService, 'storePlan').mockResolvedValue(undefined);
    vi.spyOn(planningService, 'validatePlanSecurity').mockResolvedValue(undefined);

    const agent = createAgent();
    const simplePlan = await planningService.generateExecutionPlan(
      agent,
      { intent: { primary: 'search' }, timestamp: new Date('2026-03-01T10:00:00Z') },
      { priority: 'medium' },
      { constraints: [] }
    );

    const complexPlan = await planningService.generateExecutionPlan(
      agent,
      { intent: { primary: 'modify' }, timestamp: new Date('2026-03-01T10:00:00Z') },
      { priority: 'medium' },
      { constraints: [] }
    );

    const coreStepCount = (planSteps: Array<{ id: string }>): number =>
      planSteps.filter(
        (step) =>
          step.id !== 'validate_input' &&
          step.id !== 'finalize_results' &&
          step.id !== 'prepare_knowledge'
      ).length;

    expect(coreStepCount(simplePlan.steps)).toBeLessThan(3);
    expect(coreStepCount(complexPlan.steps)).toBeGreaterThanOrEqual(3);
    expect(complexPlan.steps.length).toBeGreaterThan(simplePlan.steps.length);
  });

  it('triggers self-correction when step output does not match intent', async () => {
    const toolExecutionRequest = vi
      .fn()
      .mockResolvedValueOnce({ success: false, status: 'failed', error: 'timeout' })
      .mockResolvedValueOnce({
        success: true,
        status: 'completed',
        result: 'create artifact ready',
      });

    // @ts-expect-error — test mock: partial stub satisfies DatabaseService for unit testing
    const mockDb203: DatabaseService = {};
    // @ts-expect-error — test mock: partial stub satisfies EventBusService for unit testing
    const mockEbs203: EventBusService = {
      subscribe: vi.fn(async () => undefined),
      publish: vi.fn(async () => undefined),
      request: toolExecutionRequest,
    };
    const planningService = new AgentPlanningService({
      databaseService: mockDb203,
      eventBusService: mockEbs203,
      serviceName: 'agent-planning-test',
      securityLevel: 2,
    });

    const plan = ExecutionPlanSchema.parse({
      id: 'plan-1',
      type: 'artifact_generation',
      agentId: 'agent-1',
      steps: [
        {
          id: 'generate_artifact',
          type: 'generation',
          description: 'Generate requested artifact',
          estimatedDuration: 60,
          required: true,
        },
      ],
      dependencies: [],
      estimatedDuration: 60,
      priority: 'medium',
      constraints: [],
      metadata: {
        generatedBy: 'agent-1',
        basedOnAnalysis: new Date('2026-03-01T10:00:00Z'),
        userPreferences: {},
        version: '2.0.0',
      },
      created_at: new Date('2026-03-01T10:00:00Z'),
    });

    const executionResults = await planningService.executePlanWithSelfCorrection(plan, 'create', {
      workspaceId: 'workspace-1',
    });

    expect(executionResults).toHaveLength(1);
    expect(toolExecutionRequest).toHaveBeenCalledTimes(2);
    expect(toolExecutionRequest).toHaveBeenNthCalledWith(
      2,
      'agent.tool.execute',
      expect.objectContaining({
        parameters: expect.objectContaining({
          context: expect.objectContaining({
            retryAttempt: 1,
            previousOutput: expect.objectContaining({ status: 'failed' }),
          }),
        }),
      })
    );
  });

  it('keeps confidence scores in [0,1] and correlates them with clarity', async () => {
    const clearAnalysis = createAnalysis('analyze');
    const ambiguousAnalysis = createAnalysis('help');

    const clearActions = [
      ActionRecommendationSchema.parse({
        type: 'tool_execution',
        confidence: 0.88,
        reasoning: 'Specific intent and direct capability match.',
        estimatedDuration: 90,
        requiredCapabilities: ['search_tool'],
        riskLevel: 'low',
      }),
    ];

    const ambiguousActions = [
      ActionRecommendationSchema.parse({
        type: 'tool_execution',
        confidence: 0.55,
        reasoning: 'Intent is broad; action selected with moderate certainty.',
        estimatedDuration: 90,
        requiredCapabilities: ['search_tool'],
        riskLevel: 'medium',
      }),
    ];

    const clearResult = await decisionEngine.selectAction(clearAnalysis, clearActions);
    const ambiguousResult = await decisionEngine.selectAction(ambiguousAnalysis, ambiguousActions);

    expect(clearResult.confidence).toBeGreaterThanOrEqual(0);
    expect(clearResult.confidence).toBeLessThanOrEqual(1);
    expect(ambiguousResult.confidence).toBeGreaterThanOrEqual(0);
    expect(ambiguousResult.confidence).toBeLessThanOrEqual(1);
    expect(clearResult.confidence).toBeGreaterThan(ambiguousResult.confidence);
  });
});
