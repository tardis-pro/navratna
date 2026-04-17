export type IntentCategory =
  | 'QUERY'
  | 'COMMAND'
  | 'MONITOR'
  | 'ORCHESTRATE'
  | 'COMMUNICATE';

export type PEORPhase = 'PLAN' | 'EXECUTE' | 'OBSERVE' | 'REPLAN';

export type MetaReasoningAction =
  | 'proceed'
  | 'clarify'
  | 'delegate'
  | 'abstain'
  | 'escalate';

export interface DispatchRequest {
  readonly requestId: string;
  readonly input: string;
  readonly userId: string;
  readonly projectId: string;
  readonly contextMetadata: Record<string, unknown>;
  readonly receivedAt: Date;
}

export interface DispatchPlan {
  readonly planId: string;
  readonly requestId: string;
  readonly intentCategory: IntentCategory;
  readonly metaReasoningAction: MetaReasoningAction;
  readonly dagId: string | null;
  readonly clarificationRequired: boolean;
  readonly clarificationQuestion: string | null;
  readonly plannedAt: Date;
}

export interface DAGNodeExecution {
  readonly nodeId: string;
  readonly dagId: string;
  readonly phase: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly errorMessage: string | null;
  readonly outputSummary: string | null;
}

export interface PEORLoopState {
  readonly loopId: string;
  readonly requestId: string;
  readonly currentPhase: PEORPhase;
  readonly plan: DispatchPlan | null;
  readonly nodeExecutions: ReadonlyArray<DAGNodeExecution>;
  readonly replanCount: number;
  readonly maxReplans: number;
  readonly finalStatus: 'in-progress' | 'completed' | 'escalated' | 'aborted' | null;
}

export type CortexEvent =
  | { readonly type: 'cortex.plan.created'; readonly plan: DispatchPlan }
  | { readonly type: 'cortex.node.started'; readonly node: DAGNodeExecution }
  | { readonly type: 'cortex.node.completed'; readonly node: DAGNodeExecution }
  | { readonly type: 'cortex.node.failed'; readonly node: DAGNodeExecution; readonly willReplan: boolean }
  | { readonly type: 'cortex.replan.triggered'; readonly loopId: string; readonly replanCount: number }
  | { readonly type: 'cortex.escalated'; readonly loopId: string; readonly reason: string }
  | { readonly type: 'cortex.completed'; readonly loopId: string; readonly result: string };
