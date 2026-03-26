# cognitive — @uaip/shared-services/cognitive

Metacognitive reasoning layer. Confidence-gated execution, structured debate, explanation DAGs, meta-reasoning intercepts, and task decomposition. Powers BaseBench-Meta evaluation and agent self-critique.

## SERVICES

| File                                  | Purpose                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `confidenceGatedExecution.service.ts` | Halts tool execution below confidence threshold; triggers approval |
| `critique.service.ts`                 | Agent self-critique — evaluates own responses for quality          |
| `debate-orchestrator.service.ts`      | Structures formal multi-agent debates with argument tracking       |
| `metaReasoning.interceptor.ts`        | Intercepts reasoning steps; annotates with meta-analysis           |
| `explanationDAG.service.ts`           | Builds directed acyclic graph of reasoning chains                  |
| `taskDAG.service.ts`                  | Decomposes complex tasks into dependency-ordered sub-tasks         |
| `thought-parser.service.ts`           | Parses `<thinking>` blocks and structured CoT outputs              |
| `capabilityGapRadar.service.ts`       | Identifies gaps between agent capabilities and task requirements   |
| `workflowTemplates.ts`                | Pre-built workflow definitions for common reasoning patterns       |

## WHERE TO LOOK

| Task                            | Location                              |
| ------------------------------- | ------------------------------------- |
| Confidence gate before tool use | `confidenceGatedExecution.service.ts` |
| Formal debate between agents    | `debate-orchestrator.service.ts`      |
| Parse LLM reasoning chains      | `thought-parser.service.ts`           |
| Task dependency graph           | `taskDAG.service.ts`                  |
| Reasoning explanation trail     | `explanationDAG.service.ts`           |
| Capability gap analysis         | `capabilityGapRadar.service.ts`       |

## KEY PATTERNS

**Confidence-gated execution** — the decision engine calls this before tool invocation:

```typescript
// From agent/agent-intelligence/decision-engine.ts
const gate = new ConfidenceGatedExecutionService();
const result = await gate.evaluate(action, context);
if (!result.approved) {
  // Trigger human-in-the-loop approval
}
```

**Debate mode** — `debate-orchestrator.service.ts` coordinates with `TurnStrategyService` in discussion-orchestration. Used by `DebateHandler` in discussion-orchestration.

**Meta-reasoning intercept** — `metaReasoning.interceptor.ts` wraps LLM calls to annotate responses with reliability scores. Used by BaseBench-Meta for evaluation.

## NOTES

- This package is primarily consumed by `agent-intelligence` and `basebench-meta`
- `workflowTemplates.ts` contains static template definitions — add new templates here for complex workflows
- `explanationDAG.service.ts` outputs are used by the frontend's reasoning visualization (if enabled)
- Tests in `__tests__/` — run with `pnpm --filter @uaip/shared-services test`
