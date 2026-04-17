# PM-165 BLOCKED: conversation_enhancement_service and step_executor_service fully simulated

## Status: BLOCKED — Requires Architecture Decisions

## Services Affected

### 1. `discussion-orchestration/src/services/conversation_enhancement_service.ts`

Agent scoring uses `Math.random()` for all scoring dimensions:
- `topicMatch`, `momentumMatch`, `chattinessFactor`, `continuityPenalty`, `energyBonus`
- Agent selection is random among top candidates
- Response type determination is random

**What's needed**: Real NLP-based scoring using conversation context. This requires either:
- Integration with `@uaip/llm-service` for semantic similarity scoring
- Or vector similarity via Qdrant against agent capability vectors

### 2. `apps/shared/services/src/step_executor_service.ts`

Multiple step types are simulated:
- `executeToolStep` — random 1-3s delay, no actual tool execution
- `executeValidationStep` — 90% random pass rate
- `executeApprovalStep` — 80% random approval, should use `ApprovalWorkflowService`
- `executeDecisionStep` — `Math.random() > 0.5` random decision

**What's needed**:
- Tool execution → `CapabilityDiscoveryService.executeTool()`
- Validation → actual content validation per step schema
- Approval → `ApprovalWorkflowService.createApprovalWorkflow()` + blocking wait
- Decision → LLM-based decision or deterministic rule engine

## Why Blocked

1. Both services require real infrastructure (LLM calls, DB writes, event bus patterns)
2. `step_executor_service.ts` touches the core orchestration pipeline — risky to change without tests
3. Real approval flow requires blocking async patterns (waiting for human approval events)
4. Conversation enhancement scoring needs semantic similarity which requires embedding service

## Partial Fix (Not Implemented)

The lowest-risk partial fix would be to remove random delays from `step_executor_service.ts` and replace `executeApprovalStep` with an actual event publish + listen pattern. This is tracked as a follow-up.

## Next Steps

File separate focused tickets:
- "Wire StepExecutorService approval step to ApprovalWorkflowService" (self-contained)
- "Implement semantic agent scoring in conversation_enhancement_service" (requires LLM)
