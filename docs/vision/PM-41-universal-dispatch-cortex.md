---
title: 'Universal Dispatch Cortex — Single Entry Point, PEOR Loop, Meta-Reasoning Orchestration'
date: 2026-04-17
status: design
ticket: PM-41
phase: 2
---

# Universal Dispatch Cortex

## Problem Statement

Intent routing in navratna is fragmented. Different paths handle queries, commands, and orchestration through separate entry points. The result: inconsistent meta-reasoning application, no unified execution trace, and no systematic replan on failure.

The Universal Dispatch Cortex is the final form: **one entry point, universal resolution**.

## Architecture Overview

```
User Input (any natural language)
              │
              ▼
    ┌─────────────────────┐
    │  UniversalDispatch  │
    │  Cortex             │
    │                     │
    │  1. PLAN            │
    │  2. EXECUTE         │
    │  3. OBSERVE         │
    │  4. REPLAN          │
    └──────────┬──────────┘
               │
    ┌──────────┴─────────────────────────────────────────┐
    │             EXISTING COGNITIVE SERVICES             │
    │                                                     │
    │  MetaReasoningInterceptor  (5-action gate)          │
    │  CapabilityGapRadarService (pre-task assessment)    │
    │  TaskDAGService            (NL goal → DAG)         │
    │  ConfidenceGatedExecution  (dynamic thresholds)     │
    │  ExplanationDAGService     (reasoning graph)        │
    └─────────────────────────────────────────────────────┘
               │
    ┌──────────┴──────────┐
    │  Telescope          │
    │  TaskDAGView        │ ← live execution trace
    │  (already built)    │
    └─────────────────────┘
```

## The PEOR Loop

### 1. Plan

```
IntentField input
  → MetaReasoningInterceptor.intercept()
  → Decision: proceed | clarify | delegate | abstain | escalate
  → if proceed: TaskDAGService.buildFromNaturalLanguage(intent)
  → if clarify: return clarification request to user
  → if escalate: notify human via BullMQ event
```

**Intent Categories → Execution Paths:**

| Intent Category | Execution Path |
|----------------|---------------|
| QUERY | Knowledge retrieval (PG + Neo4j + Qdrant) |
| COMMAND | Execution path (saga DAG or direct tool call) |
| MONITOR | Event stream subscription |
| ORCHESTRATE | Multi-agent workflow (saga + checkpoints) |
| COMMUNICATE | Agent conversation thread |

### 2. Execute

```
For each DAG node:
  → CapabilityGapRadarService.preCheck(node) → block if missing tool
  → ConfidenceGatedExecution.runNode(node) → run at appropriate confidence threshold
  → spawn agents/tools as needed
  → publish node completion to event bus
```

### 3. Observe

```
ExplanationDAGService.captureReasoning(turnContext)
  → build reasoning graph in real-time
  → publish to event bus: 'cortex.node.completed' | 'cortex.node.failed'
  → Telescope TaskDAGView subscribes → live execution trace
```

### 4. Replan

```
On DAG node failure or new evidence:
  → MetaReasoningInterceptor.reEvaluate(remainingDAG, failureContext)
  → Decision: prune failed path | replace with alternative | escalate
  → Resume execution with updated DAG
```

## Key Design Decisions

1. **Non-blocking observe**: TaskDAGView gets events in real-time via WebSocket. The cortex does not wait for UI acknowledgment.

2. **CapabilityGapRadar blocks, not just logs**: If a required tool is missing, execution halts and returns an actionable error. Silent failures are not acceptable.

3. **MetaReasoning confidence gate at every node**: Not just at plan-time. Confidence thresholds apply at each DAG node — a plan that starts confident can still escalate mid-execution.

4. **Replan is first-class, not fallback**: The PEOR loop expects replanning. DAG nodes are designed with alternatives. Failure triggers replan, not abort.

## Key Interfaces

See: `apps/shared/services/src/vision/dispatch-cortex/`

## Integration Points

All five cognitive services already exist:
- `src/cognitive/meta_reasoning_interceptor.ts`
- `src/cognitive/capability_gap_radar_service.ts`
- `src/cognitive/task_d_a_g_service.ts`
- `src/cognitive/confidence_gated_execution_service.ts`
- `src/cognitive/explanation_d_a_g_service.ts`

The cortex is the **wire**, not new logic. It composes these services into a unified loop.

## Open Questions

| # | Question | Decision Needed By |
|---|----------|-------------------|
| OQ-1 | UniversalDispatchCortex location: agent-intelligence module or new shared service? | Before implementation |
| OQ-2 | Event bus topic naming: `cortex.node.*` or `dispatch.*`? | Before implementation |
| OQ-3 | How does the cortex handle concurrent PEOR loops? Isolation per workflow ID? | Before implementation |
| OQ-4 | Replan depth limit: max replan iterations before forced escalation? | Before implementation |

## Follow-Up Tickets

- `[FOLLOW-UP-P]` UniversalDispatchCortex service implementation (wiring all 5 cognitive services)
- `[FOLLOW-UP-Q]` Universal Intent Router: QUERY/COMMAND/MONITOR/ORCHESTRATE/COMMUNICATE classification
- `[FOLLOW-UP-R]` Telescope TaskDAGView wire-up to cortex WebSocket event stream
- `[FOLLOW-UP-S]` PEOR replan logic: DAG node failure → alternative path selection

## References

- `docs/specs/07-STRATEGIC-VISION-2026.md` Phase 2.4 (idea #362)
- `apps/shared/services/src/cognitive/` (all 5 cognitive services)
- `apps/frontend/src/components/TaskDAGView/` (already built)
