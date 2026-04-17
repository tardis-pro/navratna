# PM-304 Audit: workflow_instances Model for Composition Execution Tracking

**Date**: 2026-04-17  
**Auditor**: Sisyphus (epic-30-audit)  
**Status**: FIXED

## Current State (Pre-Fix)

`workflow_instances` table had core lifecycle columns only:

| Column | Status |
|--------|--------|
| id, workflowId, status, triggerType, triggerData | ✅ Present |
| currentStepId, state, error | ✅ Present |
| startedAt, completedAt, createdAt, updatedAt | ✅ Present |
| agentId (who triggered agent execution) | ❌ Missing |
| failedStepId (which step caused failure) | ❌ Missing |
| toolCallCount (how many MCP calls made) | ❌ Missing |
| totalLatencyMs (wall-clock execution time) | ❌ Missing |
| outputSnapshot (final workflow output) | ❌ Missing |

No `workflow_instance_steps` table existed for step-level tracking.

## Fixes Implemented

### `control_schema.ts` — `workflow_instances` table extensions
Added to existing table:
- `agentId` (uuid) — agent that triggered execution; indexed for agent-scoped queries
- `failedStepId` (varchar) — step that caused failure, for debugging
- `toolCallCount` (integer, default 0) — count of MCP tool calls made during execution
- `totalLatencyMs` (integer) — wall-clock execution time in ms
- `outputSnapshot` (jsonb) — snapshot of workflow output at completion

Added index: `idx_workflow_instances_agent_id`

### `control_schema.ts` — new `workflow_instance_steps` table
New table for per-step execution tracking:
| Column | Purpose |
|--------|---------|
| instanceId → workflow_instances.id | FK to parent instance |
| stepId | Workflow step identifier |
| stepName | Human-readable step name |
| status | pending/running/completed/failed/skipped |
| toolName | MCP tool used (if tool step) |
| inputSnapshot (jsonb) | Binding values at execution time |
| outputSnapshot (jsonb) | Tool result at step completion |
| errorMessage | Failure message if status=failed |
| latencyMs | Per-step execution time |
| startedAt, completedAt | Step timing |

Indexes: `idx_workflow_instance_steps_instance_id`, `idx_workflow_instance_steps_step_id`, `idx_workflow_instance_steps_status`

### `index.ts` exports
- Exported `WorkflowInstance`, `NewWorkflowInstance`, `WorkflowInstanceStep`, `NewWorkflowInstanceStep` types
- Exported `workflowInstanceSteps` table reference

## Risk Assessment

| Gap | Risk | Action |
|-----|------|--------|
| No agent-level execution tracking | MEDIUM — can't audit which agent ran what | Fixed |
| No step-level outcomes | MEDIUM — failure debugging requires full replay | Fixed |
| No latency tracking | LOW — needed for SLA monitoring | Fixed |

## Implementation Note

Schema changes require a Drizzle migration:
```bash
pnpm --filter @uaip/shared-services drizzle:generate
```
Migration files don't exist yet in this codebase. First `drizzle:generate` will produce the initial migration for all tables.

The `workflowInstanceSteps` table is currently unused by `workflow_composition_service.ts` — inserting step records requires the DAG executor integration (future work, after `TaskDAGService` is wired to `WorkflowCompositionService`).
